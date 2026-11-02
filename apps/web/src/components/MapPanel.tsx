"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type * as MapLibre from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, greatCircle, type LatLon } from "../lib/geo";
import {
  CITY_SIZE,
  CLUSTER_MAX_ZOOM,
  CLUSTER_PROPERTIES,
  CLUSTER_RADIUS,
  FLAT_PILL,
  layoutFlatPills,
  pickFontStacks,
  PILL_SORT_KEY,
  pillIconImage,
  pillTextField,
  pinFeatures,
  PRICE_SIZE,
  type FontStacks,
  type MapPin,
  type PillBox,
  type PillColors,
} from "../lib/map-pins";
import { pillImages } from "../lib/pill-images";

export type { MapPin };

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
  /** Destinations of the current list page (one pill each). */
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

/** The map element carries its MapLibre instance for e2e tests (`el.gpMap`). */
type MapHost = HTMLDivElement & { gpMap?: MapLibreMap | null };

/**
 * A style fails on its own `error` event, when its JSON has not arrived within this time, or when
 * by then nothing rendered at all (no `load`, not a single tile). Single missing tiles never count.
 */
const STYLE_TIMEOUT_MS = 8_000;
/** Below this many failed tiles we say nothing: a single 404 is normal for vector tiles. */
const TILE_ERRORS_BEFORE_NOTE = 5;
const ARC_SEGMENTS = 64;
const SRC = "gp-arcs";
const LAYER_BASE = "gp-arcs";
const LAYER_ACTIVE = "gp-arcs-active";
const SRC_ORIGINS = "gp-origins";
const LAYER_ORIGINS = "gp-origins";
const LAYER_ORIGIN_LABELS = "gp-origin-labels";
/** Destinations of the list page, clustered at low zoom. */
const SRC_DEST = "destinations";
const LAYER_DEST = "gp-destinations";
/** The hovered / selected destinations again, unclustered, drawn on top with an accent border. */
const SRC_DEST_ACTIVE = "destinations-active";
const LAYER_DEST_ACTIVE = "gp-destinations-active";
const OWN_SOURCES = new Set([SRC, SRC_ORIGINS, SRC_DEST, SRC_DEST_ACTIVE]);

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

/** Pill palette from the CSS variables (light or dark, whichever is active). */
function readPillColors(): PillColors {
  return {
    surface: cssVar("--surface", "#fffefb"),
    border: cssVar("--border-strong", "#c9c2b2"),
    text: cssVar("--text", "#1b1d1f"),
    muted: cssVar("--muted", "#5f646a"),
    accent: cssVar("--accent", "#b93c13"),
    accentText: cssVar("--accent-contrast", "#ffffff"),
  };
}

/** The palette, re-read whenever the colour scheme flips. */
function usePillColors(): PillColors {
  const [colors, setColors] = useState(readPillColors);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setColors(readPillColors());
    mq.addEventListener("change", update);
    // The palette may also follow a `data-theme` attribute on <html>.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      mq.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return colors;
}

const asExpr = (e: unknown) => e as ExpressionSpecification;

function addOrUpdateImages(map: MapLibreMap, colors: PillColors) {
  for (const img of pillImages(colors, window.devicePixelRatio || 1)) {
    if (map.hasImage(img.id)) map.updateImage(img.id, img.image);
    else map.addImage(img.id, img.image, img.options);
  }
}

/** Layout shared by the destination pill layers (variant B: city over price). */
function pillLayout(colors: PillColors, fonts: FontStacks, active: boolean) {
  return {
    "icon-image": asExpr(pillIconImage(active)),
    "icon-text-fit": "both" as const,
    "icon-text-fit-padding": [0, 0, 0, 0] as [number, number, number, number],
    "text-field": asExpr(pillTextField(colors, fonts)),
    "text-font": fonts.bold,
    "text-size": active ? PRICE_SIZE + 1 : PRICE_SIZE,
    "text-line-height": 1.2,
    "text-justify": "center" as const,
    "text-anchor": "center" as const,
    // Lines are broken explicitly; never wrap "Hiszpania · 12 kierunków".
    "text-max-width": 60,
    "text-padding": 1,
    "icon-padding": 1,
    "symbol-sort-key": asExpr(PILL_SORT_KEY),
    "text-allow-overlap": active,
    "icon-allow-overlap": active,
    "text-ignore-placement": active,
    "icon-ignore-placement": active,
    "text-optional": false,
    "icon-optional": false,
  };
}

const ACTIVE_STATE: ExpressionSpecification = [
  "any",
  ["boolean", ["feature-state", "selected"], false],
  ["boolean", ["feature-state", "hovered"], false],
];

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
  const wrapperRef = useRef<MapHost>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedRef = useRef("");
  const [mode, setMode] = useState<Mode>("loading");
  const [styleUsed, setStyleUsed] = useState<string>();
  // The style survived the STYLE_TIMEOUT_MS check (exposed for tests as data-map-verified).
  const [verified, setVerified] = useState(false);
  // Our sources and layers are on the current map instance.
  const [layersReady, setLayersReady] = useState(false);
  const [tileErrors, setTileErrors] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const colors = usePillColors();

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
  const destFeatures = useMemo(() => pinFeatures(pins), [pins]);
  const originFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: origins.map((o) => ({
        type: "Feature" as const,
        properties: { code: o.code, title: o.title },
        geometry: { type: "Point" as const, coordinates: [o.lon, o.lat] },
      })),
    }),
    [origins],
  );
  const activeKeys = [selectedKey, hoveredKey].filter((k): k is string => !!k);

  // MapLibre handlers run outside React: they read the latest values from here.
  const latest = useRef({
    arcFeatures,
    destFeatures,
    originFeatures,
    activeKeys,
    selectedKey,
    hoveredKey,
    colors,
    onSelect,
    onHover,
  });
  latest.current = {
    arcFeatures,
    destFeatures,
    originFeatures,
    activeKeys,
    selectedKey,
    hoveredKey,
    colors,
    onSelect,
    onHover,
  };
  const fontsRef = useRef<FontStacks>(pickFontStacks(undefined));

  // Create the map, walking the style chain (see STYLE_TIMEOUT_MS for when a style counts as
  // failed); after the last style, or without WebGL, the flat plan takes over.
  const styleKey = styleUrls.join("\n");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    const el = containerRef.current;
    const host = wrapperRef.current;
    if (!el) return;

    const forget = () => {
      mapRef.current = null;
      if (host) host.gpMap = null;
      setLayersReady(false);
    };
    const fallBack = () => {
      if (disposed) return;
      mapRef.current?.remove();
      forget();
      setMode("fallback");
    };

    /** Sources and layers, once per map instance: later changes only `setData` / set props. */
    const installLayers = (map: MapLibreMap) => {
      if (map.getSource(SRC)) return;
      const now = latest.current;
      const c = now.colors;
      const fonts = pickFontStacks(map.getStyle());
      fontsRef.current = fonts;
      addOrUpdateImages(map, c);

      map.addSource(SRC, { type: "geojson", data: now.arcFeatures });
      map.addLayer({
        id: LAYER_BASE,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.accent,
          "line-width": 1.4,
          "line-opacity": now.activeKeys.length ? 0.25 : 0.55,
        },
      });
      map.addLayer({
        id: LAYER_ACTIVE,
        type: "line",
        source: SRC,
        filter: ["in", ["get", "key"], ["literal", now.activeKeys]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.accent, "line-width": 3, "line-opacity": 0.95 },
      });

      map.addSource(SRC_ORIGINS, { type: "geojson", data: now.originFeatures });
      map.addLayer({
        id: LAYER_ORIGINS,
        type: "circle",
        source: SRC_ORIGINS,
        paint: {
          "circle-radius": 4,
          "circle-color": c.text,
          "circle-stroke-color": c.surface,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: LAYER_ORIGIN_LABELS,
        type: "symbol",
        source: SRC_ORIGINS,
        layout: {
          "text-field": ["get", "code"],
          "text-font": fonts.bold,
          "text-size": CITY_SIZE - 1,
          "text-anchor": "left",
          "text-offset": [0.8, 0],
          "text-letter-spacing": 0.04,
          "text-optional": true,
        },
        paint: { "text-color": c.text, "text-halo-color": c.surface, "text-halo-width": 1.5 },
      });

      map.addSource(SRC_DEST, {
        type: "geojson",
        data: now.destFeatures,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: CLUSTER_PROPERTIES as unknown as Record<string, unknown>,
      });
      map.addLayer({
        id: LAYER_DEST,
        type: "symbol",
        source: SRC_DEST,
        layout: pillLayout(c, fonts, false),
        // The active copy (layer above) replaces a hovered / selected pill.
        paint: {
          "icon-opacity": ["case", ACTIVE_STATE, 0, 1],
          "text-opacity": ["case", ACTIVE_STATE, 0, 1],
        },
      });
      map.addSource(SRC_DEST_ACTIVE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: LAYER_DEST_ACTIVE,
        type: "symbol",
        source: SRC_DEST_ACTIVE,
        layout: pillLayout(c, fonts, true),
      });

      // Pills: a destination selects its card; a cluster zooms in until it splits.
      const onClick = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties as { cluster_id?: number; key?: string };
        if (props.cluster_id !== undefined) {
          const center = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
          const source = map.getSource(SRC_DEST) as GeoJSONSource | undefined;
          void source
            ?.getClusterExpansionZoom(props.cluster_id)
            .then((zoom) => map.easeTo({ center, zoom: zoom + 0.01, duration: 450 }))
            .catch(() => undefined);
        } else if (props.key) {
          latest.current.onSelect(props.key);
        }
      };
      let hovered: string | null = null;
      const hover = (key: string | null) => {
        if (key === hovered) return; // mousemove fires per pixel; report changes only
        hovered = key;
        latest.current.onHover(key);
      };
      const onMove = (e: MapLayerMouseEvent) => {
        const key = (e.features?.[0]?.properties as { key?: string } | undefined)?.key;
        map.getCanvas().style.cursor = "pointer";
        hover(key ?? null);
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        hover(null);
      };
      for (const layer of [LAYER_DEST, LAYER_DEST_ACTIVE]) {
        map.on("click", layer, onClick);
        map.on("mousemove", layer, onMove);
        map.on("mouseleave", layer, onLeave);
      }
      setLayersReady(true);
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
        if (host) host.gpMap = map;
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
          forget();
          setTileErrors(0);
          setMode("loading");
          attempt(index + 1);
        };
        // The style JSON is in: show the map at once; tiles stream in underneath pills and arcs.
        map.on("style.load", () => {
          styleLoaded = true;
          fittedRef.current = ""; // a new map instance: fit it to the routes again
          installLayers(map);
          setStyleUsed(style);
          setMode("map");
        });
        map.on("load", () => {
          loaded = true;
        });
        // Only base-map tiles count; our own GeoJSON sources would always "load".
        map.on("data", (e) => {
          const ev = e as { sourceId?: string; tile?: unknown };
          if (ev.tile && !OWN_SOURCES.has(ev.sourceId ?? "")) tilesOk++;
        });
        map.on("error", (e) => {
          const ev = e as { sourceId?: string; tile?: unknown };
          if (ev.sourceId || ev.tile) {
            if (!OWN_SOURCES.has(ev.sourceId ?? "")) setTileErrors((n) => n + 1);
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
        // The map lives in a tab that may be display:none at first.
        observer?.disconnect();
        observer = new ResizeObserver(() => map.resize());
        observer.observe(el);
      };
      attempt(0);
    })();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      if (host) host.gpMap = null;
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

  const ready = mode === "map" && layersReady;
  const source = (id: string) => mapRef.current?.getSource(id) as GeoJSONSource | undefined;

  // Keep the sources in sync with the list: data only, the layers stay.
  useEffect(() => {
    if (ready) source(SRC)?.setData(arcFeatures);
  }, [ready, arcFeatures]);
  useEffect(() => {
    if (ready) source(SRC_ORIGINS)?.setData(originFeatures);
  }, [ready, originFeatures]);

  // Hovered / selected pills: `feature-state` hides the base copy, the active layer draws it on
  // top with an accent border. Coalesced to one update per frame (hover moves fast over a list).
  const activeSignature = `${selectedKey ?? ""}|${hoveredKey ?? ""}`;
  const appliedState = useRef<number[]>([]);
  const pendingFrame = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(() => {
      const { destFeatures: data, selectedKey: sel, hoveredKey: hov } = latest.current;
      for (const id of appliedState.current) {
        map.setFeatureState({ source: SRC_DEST, id }, { selected: false, hovered: false });
      }
      const active = data.features.filter(
        (f) => f.properties.key === sel || f.properties.key === hov,
      );
      for (const f of active) {
        map.setFeatureState(
          { source: SRC_DEST, id: f.id },
          { selected: f.properties.key === sel, hovered: f.properties.key === hov },
        );
      }
      appliedState.current = active.map((f) => f.id);
      source(SRC_DEST_ACTIVE)?.setData({ type: "FeatureCollection", features: active });
    });
    return () => cancelAnimationFrame(pendingFrame.current);
  }, [ready, activeSignature, destFeatures]);

  // New list page: new data (ids are list positions, so old states would land on other pins).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.removeFeatureState({ source: SRC_DEST });
    appliedState.current = [];
    source(SRC_DEST)?.setData(destFeatures);
  }, [ready, destFeatures]);

  // Hovered / selected destination: its arc drawn strong, the others fade back.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer(LAYER_ACTIVE)) return;
    const keys = latest.current.activeKeys;
    map.setFilter(LAYER_ACTIVE, ["in", ["get", "key"], ["literal", keys]]);
    map.setPaintProperty(LAYER_BASE, "line-opacity", keys.length ? 0.25 : 0.55);
  }, [ready, activeSignature]);

  // Colour scheme flipped: new pill images and text colours, same layers.
  const colorSignature = Object.values(colors).join("|");
  const appliedColors = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (appliedColors.current === "") appliedColors.current = colorSignature; // installed with these
    if (appliedColors.current === colorSignature) return;
    appliedColors.current = colorSignature;
    addOrUpdateImages(map, colors);
    const fonts = fontsRef.current;
    map.setLayoutProperty(LAYER_DEST, "text-field", asExpr(pillTextField(colors, fonts)));
    map.setLayoutProperty(LAYER_DEST_ACTIVE, "text-field", asExpr(pillTextField(colors, fonts)));
    map.setPaintProperty(LAYER_BASE, "line-color", colors.accent);
    map.setPaintProperty(LAYER_ACTIVE, "line-color", colors.accent);
    map.setPaintProperty(LAYER_ORIGINS, "circle-color", colors.text);
    map.setPaintProperty(LAYER_ORIGINS, "circle-stroke-color", colors.surface);
    map.setPaintProperty(LAYER_ORIGIN_LABELS, "text-color", colors.text);
    map.setPaintProperty(LAYER_ORIGIN_LABELS, "text-halo-color", colors.surface);
  }, [ready, colorSignature]);
  useEffect(() => {
    if (!ready) appliedColors.current = "";
  }, [ready]);

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

  // Selecting a card pans the map to its pill when it is out of view.
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
  const flatPills = useMemo(
    () =>
      flat
        ? layoutFlatPills(pins, flat.project, measurePillText, { w: size.w, h: size.h }, activeKeys)
        : [],
    [flat, pins, size.w, size.h, activeSignature],
  );

  const pinCount = ready ? pins.length : mode === "fallback" ? flatPills.length : 0;
  const originCount = ready || mode === "fallback" ? origins.length : 0;
  const arcCount = mode === "fallback" ? arcLines.length : ready ? arcs.length : 0;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full min-h-72 w-full overflow-hidden bg-map"
      data-testid="map"
      data-map-mode={mode}
      data-map-style={styleUsed}
      data-map-verified={verified}
      data-arcs={arcCount}
      data-pins={pinCount}
      data-origins={originCount}
    >
      {/* Inline position: maplibre-gl.css gives `.maplibregl-map` `position: relative`, which
          would beat a utility class and collapse the container to zero height. */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        className={mode === "fallback" ? "invisible" : undefined}
      />
      {mode === "fallback" && flat && (
        <FlatPlan
          flat={flat}
          arcLines={arcLines}
          origins={origins}
          pills={flatPills}
          activeKeys={activeKeys}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onHover={onHover}
          w={size.w}
          h={size.h}
        />
      )}
      {mode === "fallback" && pins.length > flatPills.length && (
        <p className="pointer-events-none absolute left-2 top-2 z-[6000] rounded-md bg-surface/90 px-2 py-1 text-xs text-muted">
          Na planie: {flatPills.length} z {pins.length} cen.
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

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Width of a pill line in the page font (canvas `measureText`), for the flat plan. */
function measurePillText(text: string, line: "city" | "price"): number {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  const size = line === "city" ? CITY_SIZE : PRICE_SIZE;
  if (!measureCtx) return text.length * size * 0.6;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  measureCtx.font = `${line === "city" ? 500 : 600} ${size}px ${family}`;
  return measureCtx.measureText(text).width;
}

/**
 * The offline plan: graticule, great-circle arcs, origin dots and the same two-line pills as the
 * map, all in SVG (colours from the CSS variables, so dark mode just works).
 */
function FlatPlan({
  flat,
  arcLines,
  origins,
  pills,
  activeKeys,
  selectedKey,
  onSelect,
  onHover,
  w,
  h,
}: {
  flat: ReturnType<typeof flatProjection>;
  arcLines: { key: string; coords: [number, number][] }[];
  origins: MapOrigin[];
  pills: PillBox[];
  activeKeys: string[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
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
  // Origin dots always; their codes only where they do not cover another code.
  const labelBoxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const originDots = origins.map((o) => {
    const { x, y } = project(o.lat, o.lon);
    const box = { x0: x + 6, x1: x + 10 + o.code.length * 7, y0: y - 7, y1: y + 7 };
    const labelled = !labelBoxes.some(
      (b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0,
    );
    if (labelled) labelBoxes.push(box);
    return { o, x, y, labelled };
  });
  // Paint order: the active pills last, so they sit on top.
  const ordered = [...pills]
    .reverse()
    .sort((a, b) => +active.has(a.pin.key) - +active.has(b.pin.key));
  return (
    <svg
      className="absolute inset-0"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      data-testid="map-arcs"
    >
      <g aria-hidden stroke="var(--map-grid)" strokeWidth="1">
        {lons.map((l) => {
          const x = project(0, l).x;
          return <line key={`x${l}`} x1={x} x2={x} y1={0} y2={h} />;
        })}
        {lats.map((l) => {
          const y = project(l, 0).y;
          return <line key={`y${l}`} x1={0} x2={w} y1={y} y2={y} strokeWidth={l === 0 ? 1.6 : 1} />;
        })}
      </g>
      <g
        aria-hidden
        fill="none"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
      <g aria-hidden>
        {originDots.map(({ o, x, y, labelled }) => (
          <g key={o.code} data-testid="map-origin">
            <title>{o.title}</title>
            <circle
              cx={x}
              cy={y}
              r={4}
              fill="var(--origin)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
            {labelled && (
              <text
                x={x + 8}
                y={y + 3.5}
                fontSize={CITY_SIZE - 1}
                fontWeight={600}
                letterSpacing="0.04em"
                fill="var(--text)"
                stroke="var(--surface)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {o.code}
              </text>
            )}
          </g>
        ))}
      </g>
      <g>
        {ordered.map(({ pin, x, y, w: pw, h: ph }) => {
          const on = active.has(pin.key);
          const accent = pin.cheapestOverall;
          const top = y - ph / 2;
          return (
            <g
              key={pin.key}
              role="button"
              tabIndex={0}
              data-testid="map-pin"
              data-active={on || undefined}
              aria-label={`${pin.city}, ${pin.priceLabel}`}
              aria-pressed={pin.key === selectedKey}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(pin.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(pin.key);
                }
              }}
              onMouseEnter={() => onHover(pin.key)}
              onMouseLeave={() => onHover(null)}
            >
              <rect
                x={x - pw / 2}
                y={top}
                width={pw}
                height={ph}
                rx={12}
                fill={accent ? "var(--accent)" : "var(--surface)"}
                stroke={
                  on
                    ? accent
                      ? "var(--text)"
                      : "var(--accent)"
                    : accent
                      ? "var(--accent)"
                      : "var(--border-strong)"
                }
                strokeWidth={on ? 2 : 1}
                style={{ filter: "drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18))" }}
              />
              <text
                x={x}
                y={top + FLAT_PILL.padY + 11}
                textAnchor="middle"
                fontSize={CITY_SIZE}
                fontWeight={500}
                fill={accent ? "var(--accent-contrast)" : "var(--muted)"}
              >
                {pin.city}
              </text>
              <text
                x={x}
                y={top + FLAT_PILL.padY + FLAT_PILL.cityLine + 14}
                textAnchor="middle"
                fontSize={PRICE_SIZE}
                fontWeight={600}
                fill={accent ? "var(--accent-contrast)" : "var(--text)"}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {pin.priceLabel}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
