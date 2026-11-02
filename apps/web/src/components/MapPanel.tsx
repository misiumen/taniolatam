"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type * as MapLibre from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, greatCircle, type LatLon } from "../lib/geo";

export interface MapPin {
  key: string;
  lat: number;
  lon: number;
  /** Text on the pin, e.g. "1 234 zł". */
  label: string;
  title: string;
}

/** Flight direction: departure airport → destination of one list entry. */
export interface MapArc {
  key: string;
  from: LatLon;
  to: LatLon;
}

export interface MapOrigin {
  code: string;
  lat: number;
  lon: number;
  title: string;
}

interface Props {
  /** Destinations, cheapest first (that is also the decluttering priority). */
  pins: MapPin[];
  /** Arcs for the destinations currently shown in the list. */
  arcs: MapArc[];
  origins: MapOrigin[];
  selectedKey: string | null;
  hoveredKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  /** Styles to try in order; after the last one fails the flat plan is shown. */
  styleUrls: string[];
}

type Mode = "loading" | "map" | "fallback";

/**
 * A style fails on its own `error` event, when its JSON has not arrived within this time, or when
 * by then nothing rendered at all (no `load`, not a single tile). Single missing tiles never count.
 */
const STYLE_TIMEOUT_MS = 8_000;
/** Below this many failed tiles we say nothing: a single 404 is normal for vector tiles. */
const TILE_ERRORS_BEFORE_NOTE = 5;
const MAX_CANDIDATES = 400;
const ARC_SEGMENTS = 64;
const SRC = "gp-arcs";
const LAYER_BASE = "gp-arcs";
const LAYER_ACTIVE = "gp-arcs-active";

const RAD = Math.PI / 180;

/**
 * MapLibre derives its worker URL from `import.meta.url`, which webpack rewrites to a `file://`
 * URL, so the worker never starts and no vector tile is ever parsed (the map hangs on its first
 * frame). Emit the worker file as a static asset and hand MapLibre its URL explicitly.
 */
const WORKER_URL = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href;

type Projector = (lat: number, lon: number) => { x: number; y: number };

/**
 * Flat (equirectangular, cos-corrected) projection fitted to the given `[lon, lat]` points, used
 * when no map style can be loaded. Equal scale on both axes so routes keep their shape.
 */
function flatProjection(points: [number, number][], w: number, h: number) {
  let [minLon, minLat, maxLon, maxLat] =
    points.length > 0 ? bbox(points) : ([-25, -35, 150, 70] as const);
  const grow = (min: number, max: number, span: number): [number, number] => {
    const mid = (min + max) / 2;
    const half = Math.max((max - min) / 2, span / 2);
    return [mid - half, mid + half];
  };
  [minLon, maxLon] = grow(minLon, maxLon, 30);
  [minLat, maxLat] = grow(minLat, maxLat, 18);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const k = Math.max(0.45, Math.cos(cy * RAD));
  const pad = Math.min(56, Math.min(w, h) * 0.12);
  const scale = Math.max(
    0.01,
    Math.min((w - 2 * pad) / ((maxLon - minLon) * k), (h - 2 * pad) / (maxLat - minLat)),
  );
  const project: Projector = (lat, lon) => ({
    x: w / 2 + (lon - cx) * k * scale,
    y: h / 2 - (lat - cy) * scale,
  });
  const view = {
    minLon: cx - w / 2 / (k * scale),
    maxLon: cx + w / 2 / (k * scale),
    minLat: cy - h / 2 / scale,
    maxLat: cy + h / 2 / scale,
  };
  return { project, view, scale };
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export default function MapPanel({
  pins,
  arcs,
  origins,
  selectedKey,
  hoveredKey,
  onSelect,
  onHover,
  styleUrls,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedRef = useRef("");
  const [mode, setMode] = useState<Mode>("loading");
  const [styleUsed, setStyleUsed] = useState<string>();
  // The style survived the STYLE_TIMEOUT_MS check (exposed for tests as data-map-verified).
  const [verified, setVerified] = useState(false);
  const [arcLayer, setArcLayer] = useState(false);
  const [tileErrors, setTileErrors] = useState(0);
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const arcLines = useMemo(
    () => arcs.map((a) => ({ key: a.key, coords: greatCircle(a.from, a.to, ARC_SEGMENTS) })),
    [arcs],
  );
  const arcFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: arcLines.map((a) => ({
        type: "Feature" as const,
        properties: { key: a.key },
        geometry: { type: "LineString" as const, coordinates: a.coords },
      })),
    }),
    [arcLines],
  );
  // The style-load handler runs outside React; it reads the latest arcs from here.
  const arcFeaturesRef = useRef(arcFeatures);
  arcFeaturesRef.current = arcFeatures;
  const activeKeys = [selectedKey, hoveredKey].filter((k): k is string => !!k);
  const activeRef = useRef(activeKeys);
  activeRef.current = activeKeys;

  // Create the map, walking the style chain (see STYLE_TIMEOUT_MS for when a style counts as
  // failed); after the last style, or without WebGL, the flat plan takes over.
  const styleKey = styleUrls.join("\n");
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    const el = containerRef.current;
    if (!el) return;

    const fallBack = () => {
      if (disposed) return;
      mapRef.current?.remove();
      mapRef.current = null;
      setArcLayer(false);
      setMode("fallback");
    };

    const installArcs = (map: MapLibreMap) => {
      if (map.getSource(SRC)) return;
      const color = cssVar("--accent", "#b93c13");
      map.addSource(SRC, { type: "geojson", data: arcFeaturesRef.current });
      map.addLayer({
        id: LAYER_BASE,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": color,
          "line-width": 1.4,
          "line-opacity": activeRef.current.length ? 0.25 : 0.55,
        },
      });
      map.addLayer({
        id: LAYER_ACTIVE,
        type: "line",
        source: SRC,
        filter: ["in", ["get", "key"], ["literal", activeRef.current]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 3, "line-opacity": 0.95 },
      });
      setArcLayer(true);
    };

    (async () => {
      let ml: typeof MapLibre;
      try {
        ml = await import("maplibre-gl");
        if (ml.getWorkerUrl() !== WORKER_URL) ml.setWorkerUrl(WORKER_URL);
      } catch {
        fallBack();
        return;
      }
      const attempt = (index: number) => {
        if (disposed) return;
        const style = styleUrls[index];
        if (!style) return fallBack();
        let map: MapLibreMap;
        try {
          map = new ml.Map({
            container: el,
            style,
            center: [15, 35],
            zoom: 1.4,
            attributionControl: { compact: true },
            renderWorldCopies: false,
          });
        } catch {
          // No WebGL: no style will help.
          fallBack();
          return;
        }
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        let settled = false;
        let styleLoaded = false;
        let loaded = false;
        let tilesOk = 0;
        const next = () => {
          if (settled || disposed) return;
          settled = true;
          if (timer) clearTimeout(timer);
          observer?.disconnect();
          map.remove();
          mapRef.current = null;
          setArcLayer(false);
          setTileErrors(0);
          setMode("loading");
          attempt(index + 1);
        };
        // The style JSON is in: show the map at once; tiles stream in underneath pins and arcs.
        map.on("style.load", () => {
          styleLoaded = true;
          fittedRef.current = ""; // a new map instance: fit it to the routes again
          installArcs(map);
          setStyleUsed(style);
          setMode("map");
        });
        map.on("load", () => {
          loaded = true;
        });
        // Only base-map tiles count; our own arcs source would always "load".
        map.on("data", (e) => {
          const ev = e as { sourceId?: string; tile?: unknown };
          if (ev.tile && ev.sourceId !== SRC) tilesOk++;
        });
        map.on("error", (e) => {
          const ev = e as { sourceId?: string; tile?: unknown };
          if (ev.sourceId || ev.tile) {
            if (ev.sourceId !== SRC) setTileErrors((n) => n + 1);
          }
          // Before the style JSON is in, an error that is not about a tile is the style failing.
          else if (!styleLoaded) next();
        });
        // Give up on this style if its JSON has not arrived, or if nothing at all rendered
        // (no `load` and not one tile) — a few missing tiles never count.
        timer = setTimeout(() => {
          if (settled || disposed) return;
          if (!styleLoaded || (!loaded && tilesOk === 0)) return next();
          settled = true;
          setVerified(true);
        }, STYLE_TIMEOUT_MS);
        const schedule = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => setTick((t) => t + 1));
        };
        map.on("move", schedule);
        map.on("resize", schedule);
        // The map lives in a tab that may be display:none at first.
        observer?.disconnect();
        observer = new ResizeObserver(() => map.resize());
        observer.observe(el);
      };
      attempt(0);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // styleKey stands for styleUrls.
  }, [styleKey]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the arc layer in sync with the list.
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "map" || !map || !arcLayer) return;
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(arcFeatures);
  }, [mode, arcLayer, arcFeatures]);

  // Hovered / selected destination: its arc drawn strong, the others fade back.
  const activeSignature = activeKeys.join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "map" || !map || !arcLayer || !map.getLayer(LAYER_ACTIVE)) return;
    map.setFilter(LAYER_ACTIVE, ["in", ["get", "key"], ["literal", activeRef.current]]);
    map.setPaintProperty(LAYER_BASE, "line-opacity", activeRef.current.length ? 0.25 : 0.55);
  }, [mode, arcLayer, activeSignature]);

  // Fit to the routes of the list whenever they change (or to all pins when there are none).
  const fitPoints = useMemo<[number, number][]>(
    () =>
      arcLines.length > 0 ? arcLines.flatMap((a) => a.coords) : pins.map((p) => [p.lon, p.lat]),
    [arcLines, pins],
  );
  const fitSignature = `${arcs.map((a) => a.key).join("|")}#${pins.length}`;
  // A map created in a hidden tab has no size yet: fit once it becomes visible.
  const hasSize = size.w > 0 && size.h > 0;
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "map" || !map || !hasSize || fitPoints.length === 0) return;
    if (fittedRef.current === fitSignature) return;
    fittedRef.current = fitSignature;
    map.resize();
    const [minLon, minLat, maxLon, maxLat] = bbox(fitPoints);
    if (maxLon - minLon < 0.5 && maxLat - minLat < 0.5) {
      map.easeTo({ center: [minLon, minLat], zoom: 4, duration: 0 });
    } else {
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 48, maxZoom: 5, duration: 0 },
      );
    }
  }, [mode, fitPoints, fitSignature, hasSize]);

  // Selecting a card pans the map to its pin when it is out of view.
  useEffect(() => {
    const map = mapRef.current;
    const pin = pins.find((p) => p.key === selectedKey);
    if (mode !== "map" || !map || !pin) return;
    if (!map.getBounds().contains([pin.lon, pin.lat])) {
      map.easeTo({ center: [pin.lon, pin.lat], duration: 400 });
    }
  }, [selectedKey, mode]);

  const flat = useMemo(
    () => (mode === "fallback" && size.w > 0 ? flatProjection(fitPoints, size.w, size.h) : null),
    [mode, fitPoints, size.w, size.h],
  );

  const project = (lat: number, lon: number): { x: number; y: number } | null => {
    if (mode === "map" && mapRef.current) return mapRef.current.project([lon, lat]);
    if (mode === "fallback" && flat) return flat.project(lat, lon);
    return null;
  };

  // Pins are laid out in container pixels and decluttered: a pin is dropped when it would cover
  // one placed earlier (selected, hovered, the list's destinations, then by price), so zooming in
  // reveals more.
  const arcKeys = useMemo(() => new Set(arcs.map((a) => a.key)), [arcs]);
  // Priority order only changes with the data or the highlight, not on every map move.
  const ordered = useMemo(() => {
    const rank = (p: MapPin) =>
      p.key === selectedKey ? 0 : p.key === hoveredKey ? 1 : arcKeys.has(p.key) ? 2 : 3;
    return pins
      .map((p, i) => ({ p, i, r: rank(p) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .slice(0, MAX_CANDIDATES + 2)
      .map((x) => x.p);
  }, [pins, selectedKey, hoveredKey, arcKeys]);
  const visible = (() => {
    if (mode === "loading" || size.w === 0) return [];
    const kept: { pin: MapPin; x: number; y: number }[] = [];
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const pin of ordered) {
      const pos = project(pin.lat, pin.lon);
      if (!pos || pos.x < -40 || pos.y < -20 || pos.x > size.w + 40 || pos.y > size.h + 20)
        continue;
      const half = (pin.label.length * 7 + 18) / 2;
      const box = { x0: pos.x - half, x1: pos.x + half, y0: pos.y - 12, y1: pos.y + 12 };
      const hit = boxes.some(
        (b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0,
      );
      if (hit) continue;
      boxes.push(box);
      kept.push({ pin, x: pos.x, y: pos.y });
    }
    return kept;
  })();

  // Origin dots are always drawn; their code labels are decluttered among themselves.
  const originDots = (() => {
    if (mode === "loading" || size.w === 0) return [];
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    return origins.flatMap((o) => {
      const pos = project(o.lat, o.lon);
      if (!pos) return [];
      const box = {
        x0: pos.x - 6,
        x1: pos.x + 14 + o.code.length * 7,
        y0: pos.y - 8,
        y1: pos.y + 8,
      };
      const labelled = !boxes.some(
        (b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0,
      );
      if (labelled) boxes.push(box);
      return [{ o, labelled, ...pos }];
    });
  })();

  const arcCount =
    mode === "fallback" ? arcLines.length : mode === "map" && arcLayer ? arcs.length : 0;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full min-h-72 w-full overflow-hidden bg-map"
      data-testid="map"
      data-map-mode={mode}
      data-map-style={styleUsed}
      data-map-verified={verified}
      data-arcs={arcCount}
    >
      {/* Inline position: maplibre-gl.css gives `.maplibregl-map` `position: relative`, which
          would beat a utility class and collapse the container to zero height. */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        className={mode === "fallback" ? "invisible" : undefined}
      />
      {mode === "fallback" && flat && (
        <FlatPlan flat={flat} arcLines={arcLines} activeKeys={activeKeys} w={size.w} h={size.h} />
      )}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {originDots.map(({ o, labelled, x, y }) => (
          <span
            key={o.code}
            data-testid="map-origin"
            title={o.title}
            className="origin-pin absolute flex items-center"
            style={{ left: x, top: y, zIndex: 500 }}
          >
            <span className="block size-2.5 rounded-full border-2 border-surface bg-[var(--origin)] shadow-[0_0_0_1px_var(--origin)]" />
            {labelled && (
              <span className="absolute left-3.5 whitespace-nowrap rounded bg-surface/85 px-1 text-[10px] font-semibold tracking-wide text-fg">
                {o.code}
              </span>
            )}
          </span>
        ))}
        {visible.map(({ pin, x, y }, i) => {
          const selected = pin.key === selectedKey;
          const hovered = pin.key === hoveredKey;
          // Destinations on the list (with an arc) get full pins; the rest stay quieter.
          const listed = arcKeys.has(pin.key);
          return (
            <button
              key={pin.key}
              type="button"
              data-testid="map-pin"
              aria-label={`${pin.title}, ${pin.label}`}
              aria-pressed={selected}
              title={`${pin.title} — ${pin.label}`}
              onClick={() => onSelect(pin.key)}
              onMouseEnter={() => onHover(pin.key)}
              onMouseLeave={() => onHover(null)}
              data-listed={listed}
              className={`price-pin pointer-events-auto absolute whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${
                selected
                  ? "border-accent bg-accent font-semibold text-accent-fg"
                  : hovered
                    ? "border-fg bg-fg font-semibold text-bg"
                    : listed
                      ? "border-line-strong bg-surface font-semibold text-fg hover:border-fg"
                      : "border-transparent bg-surface/75 text-muted hover:border-line-strong hover:text-fg"
              }`}
              style={{ left: x, top: y, zIndex: selected ? 5000 : hovered ? 4000 : 1000 - i }}
            >
              {pin.label}
            </button>
          );
        })}
      </div>
      {mode !== "loading" && pins.length > visible.length && (
        <p className="pointer-events-none absolute left-2 top-2 z-[6000] rounded-md bg-surface/90 px-2 py-1 text-xs text-muted">
          Na mapie: {visible.length} z {pins.length} cen
          {mode === "map" ? " — przybliż, aby zobaczyć więcej." : "."}
        </p>
      )}
      {mode !== "loading" && pins.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
          Tu pojawią się trasy i ceny.
        </p>
      )}
      {mode === "loading" && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted">
          Ładowanie mapy…
        </p>
      )}
      {mode === "fallback" && (
        <p
          role="status"
          data-testid="map-offline-note"
          className="absolute bottom-2 left-2 right-2 z-[6000] rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg"
        >
          Mapa niedostępna offline — pokazujemy trasy i ceny na uproszczonym planie. Lista działa
          normalnie.
        </p>
      )}
      {mode === "map" && tileErrors >= TILE_ERRORS_BEFORE_NOTE && (
        <p
          role="status"
          className="absolute bottom-8 left-2 right-2 z-[6000] rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg"
        >
          Część kafelków mapy nie wczytała się. Trasy i ceny są nadal aktualne.
        </p>
      )}
    </div>
  );
}

/** Graticule + great-circle arcs drawn with SVG on the flat plan (no map style available). */
function FlatPlan({
  flat,
  arcLines,
  activeKeys,
  w,
  h,
}: {
  flat: ReturnType<typeof flatProjection>;
  arcLines: { key: string; coords: [number, number][] }[];
  activeKeys: string[];
  w: number;
  h: number;
}) {
  const { project, view, scale } = flat;
  const step = scale * 10 > 60 ? 10 : scale * 20 > 50 ? 20 : 30;
  const lons: number[] = [];
  for (let l = Math.ceil(view.minLon / step) * step; l <= view.maxLon; l += step) lons.push(l);
  const lats: number[] = [];
  for (let l = Math.ceil(view.minLat / step) * step; l <= view.maxLat; l += step) lats.push(l);
  const path = (coords: [number, number][]) =>
    coords
      .map(([lon, lat], i) => {
        const p = project(lat, lon);
        return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join("");
  const active = new Set(activeKeys);
  const dim = active.size > 0;
  return (
    <svg
      aria-hidden
      className="absolute inset-0"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      data-testid="map-arcs"
    >
      <g stroke="var(--map-grid)" strokeWidth="1">
        {lons.map((l) => {
          const x = project(0, l).x;
          return <line key={`x${l}`} x1={x} x2={x} y1={0} y2={h} />;
        })}
        {lats.map((l) => {
          const y = project(l, 0).y;
          return <line key={`y${l}`} x1={0} x2={w} y1={y} y2={y} strokeWidth={l === 0 ? 1.6 : 1} />;
        })}
      </g>
      <g fill="none" stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round">
        {arcLines
          .filter((a) => !active.has(a.key))
          .map((a) => (
            <path
              key={a.key}
              data-testid="map-arc"
              d={path(a.coords)}
              strokeWidth={1.4}
              strokeOpacity={dim ? 0.25 : 0.55}
            />
          ))}
        {arcLines
          .filter((a) => active.has(a.key))
          .map((a) => (
            <path
              key={a.key}
              data-testid="map-arc"
              data-active="true"
              d={path(a.coords)}
              strokeWidth={3}
              strokeOpacity={0.95}
            />
          ))}
      </g>
    </svg>
  );
}
