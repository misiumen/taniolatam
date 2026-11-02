"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { mapStyleChain, type PublicConfig } from "../lib/public-config";
import type { MapArc, MapOrigin, MapPin } from "./MapPanel";

export type { MapArc, MapOrigin, MapPin };

const loadingBox = (
  <div className="grid h-full min-h-72 place-items-center bg-map text-sm text-muted">
    Ładowanie mapy…
  </div>
);

// maplibre-gl needs `window`/WebGL: load it on the client only.
const MapPanel = dynamic(() => import("./MapPanel"), { ssr: false, loading: () => loadingBox });

interface Props {
  pins: MapPin[];
  arcs: MapArc[];
  origins: MapOrigin[];
  selectedKey: string | null;
  hoveredKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
}

let configPromise: Promise<string[]> | undefined;

/**
 * The style chain comes from the server at runtime (`GET /api/v1/config`, env `MAP_STYLE_URL`), so
 * one Docker image works everywhere. If that request fails we still try the built-in chain; a
 * legacy build-time `NEXT_PUBLIC_MAP_STYLE_URL` leads it when set.
 */
function loadStyleUrls(): Promise<string[]> {
  configPromise ??= fetch("/api/v1/config")
    .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : Promise.reject(new Error())))
    .then((c) => (c.mapStyleUrls?.length ? c.mapStyleUrls : Promise.reject(new Error())))
    .catch(() => {
      configPromise = undefined; // retry on the next mount
      return mapStyleChain(process.env.NEXT_PUBLIC_MAP_STYLE_URL);
    });
  return configPromise;
}

export function MapView(props: Props) {
  const [styleUrls, setStyleUrls] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadStyleUrls().then((urls) => live && setStyleUrls(urls));
    return () => {
      live = false;
    };
  }, []);
  if (!styleUrls) return loadingBox;
  return <MapPanel {...props} styleUrls={styleUrls} />;
}
