"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

export interface MapPin {
  key: string;
  lat: number;
  lon: number;
  /** Text on the pin, e.g. "1 234 zł". */
  label: string;
  title: string;
}

interface Props {
  pins: MapPin[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  styleUrl: string;
}

type Mode = "loading" | "map" | "fallback";

const LOAD_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES = 400;

/** Flat (equirectangular) layout of the pins' bounding box, used when tiles are unavailable. */
function flatLayout(pins: MapPin[]) {
  const lons = pins.map((p) => p.lon);
  const lats = pins.map((p) => p.lat);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  const padTo = (min: number, max: number, span: number): [number, number] => {
    const mid = (min + max) / 2;
    const half = Math.max((max - min) / 2, span / 2);
    return [mid - half, mid + half];
  };
  [minLon, maxLon] = padTo(minLon, maxLon, 30);
  [minLat, maxLat] = padTo(minLat, maxLat, 20);
  /** Position as a fraction (0..1) of the container. */
  return (lat: number, lon: number) => ({
    fx: 0.08 + ((lon - minLon) / (maxLon - minLon)) * 0.84,
    fy: 0.08 + ((maxLat - lat) / (maxLat - minLat)) * 0.84,
  });
}

export default function MapPanel({ pins, selectedKey, onSelect, styleUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedRef = useRef("");
  const [mode, setMode] = useState<Mode>("loading");
  const [tileProblem, setTileProblem] = useState(false);
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Create the map once; any failure to load the style degrades to the flat pin layout.
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
      setMode("fallback");
    };

    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (disposed) return;
        const map = new ml.Map({
          container: el,
          style: styleUrl,
          center: [15, 30],
          zoom: 1.4,
          attributionControl: { compact: true },
          renderWorldCopies: false,
        });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        let loaded = false;
        map.on("load", () => {
          loaded = true;
          if (timer) clearTimeout(timer);
          setMode("map");
        });
        map.on("error", (e) => {
          if (!loaded) fallBack();
          else if ((e as { sourceId?: string }).sourceId) setTileProblem(true);
        });
        const schedule = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => setTick((t) => t + 1));
        };
        map.on("move", schedule);
        map.on("resize", schedule);
        timer = setTimeout(() => !loaded && fallBack(), LOAD_TIMEOUT_MS);
        // The map lives in a tab that may be display:none at first.
        observer = new ResizeObserver(() => map.resize());
        observer.observe(el);
      } catch {
        fallBack();
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit to results whenever the set of pins changes.
  const pinSignature = pins.map((p) => p.key).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "map" || !map || pins.length === 0 || fittedRef.current === pinSignature) return;
    fittedRef.current = pinSignature;
    const lons = pins.map((p) => p.lon);
    const lats = pins.map((p) => p.lat);
    if (pins.length === 1) {
      map.easeTo({ center: [lons[0]!, lats[0]!], zoom: 4, duration: 0 });
    } else {
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 5, duration: 0 },
      );
    }
  }, [mode, pins, pinSignature]);

  // Selecting a card pans the map to its pin.
  useEffect(() => {
    const map = mapRef.current;
    const pin = pins.find((p) => p.key === selectedKey);
    if (mode === "map" && map && pin) map.easeTo({ center: [pin.lon, pin.lat], duration: 400 });
  }, [selectedKey, mode]);

  const flat = useMemo(() => (pins.length > 0 ? flatLayout(pins) : null), [pins]);

  // Pins are laid out in container pixels and decluttered: a pin is dropped when it would cover
  // a cheaper one (so zooming in reveals more). The selected pin always wins.
  const visible = (() => {
    if (mode === "loading" || size.w === 0) return [];
    const position = (pin: MapPin): { x: number; y: number } | null => {
      if (mode === "map" && mapRef.current) {
        const p = mapRef.current.project([pin.lon, pin.lat]);
        return { x: p.x, y: p.y };
      }
      if (mode === "fallback" && flat) {
        const { fx, fy } = flat(pin.lat, pin.lon);
        return { x: fx * size.w, y: fy * size.h };
      }
      return null;
    };
    const kept: { pin: MapPin; x: number; y: number }[] = [];
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const ordered = [
      ...pins.filter((p) => p.key === selectedKey),
      ...pins.filter((p) => p.key !== selectedKey).slice(0, MAX_CANDIDATES),
    ];
    for (const pin of ordered) {
      const pos = position(pin);
      if (!pos || pos.x < -40 || pos.y < -20 || pos.x > size.w + 40 || pos.y > size.h + 20)
        continue;
      const half = (pin.label.length * 7 + 18) / 2;
      const box = { x0: pos.x - half, x1: pos.x + half, y0: pos.y - 11, y1: pos.y + 11 };
      const hit = boxes.some(
        (b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0,
      );
      if (hit) continue;
      boxes.push(box);
      kept.push({ pin, ...pos });
    }
    return kept;
  })();

  return (
    <div
      ref={wrapperRef}
      className="relative h-full min-h-72 w-full overflow-hidden bg-map"
      data-testid="map"
      data-map-mode={mode}
    >
      <div
        ref={containerRef}
        className={`absolute inset-0 ${mode === "fallback" ? "invisible" : ""}`}
      />
      {mode === "fallback" && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "10% 10%",
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {visible.map(({ pin, x, y }, i) => {
          const selected = pin.key === selectedKey;
          return (
            <button
              key={pin.key}
              type="button"
              data-testid="map-pin"
              aria-label={`${pin.title}, ${pin.label}`}
              aria-pressed={selected}
              title={`${pin.title} — ${pin.label}`}
              onClick={() => onSelect(pin.key)}
              className={`price-pin pointer-events-auto absolute whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold shadow ${
                selected
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-surface text-fg hover:border-accent"
              }`}
              style={{ left: x, top: y, zIndex: selected ? 5000 : 1000 - i }}
            >
              {pin.label}
            </button>
          );
        })}
      </div>
      {mode !== "loading" && pins.length > visible.length && (
        <p className="pointer-events-none absolute left-2 top-2 rounded-md bg-surface/90 px-2 py-1 text-xs text-muted">
          Na mapie: {visible.length} z {pins.length} cen
          {mode === "map" ? " — przybliż, aby zobaczyć więcej." : "."}
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
          className="absolute bottom-2 left-2 right-2 rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg"
        >
          Mapa niedostępna offline — pokazujemy ceny na uproszczonym planie. Lista działa normalnie.
        </p>
      )}
      {mode === "map" && tileProblem && (
        <p
          role="status"
          className="absolute bottom-2 left-2 right-2 rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-fg"
        >
          Część kafelków mapy nie wczytała się. Piny z cenami nadal są aktualne.
        </p>
      )}
    </div>
  );
}
