"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./MapPanel";

export type { MapPin };

// maplibre-gl needs `window`/WebGL: load it on the client only.
const MapPanel = dynamic(() => import("./MapPanel"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-72 place-items-center bg-map text-sm text-muted">
      Ładowanie mapy…
    </div>
  ),
});

export const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

interface Props {
  pins: MapPin[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function MapView(props: Props) {
  // Inlined at build time by Next.js.
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE_URL;
  return <MapPanel {...props} styleUrl={styleUrl} />;
}
