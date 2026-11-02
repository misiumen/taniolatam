import { expect, type Page } from "@playwright/test";

/**
 * Hermetic MapLibre for e2e: `/api/v1/config` points at a tiny local raster style served by the
 * test (no glyphs URL, so MapLibre draws the pill text locally — the same code path as a style
 * whose glyph server is unreachable). Optionally the first style 404s and some tiles 404.
 */

// 1×1 PNG served as every map tile (except, optionally, a few that 404).
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export async function useLocalMapStyle(
  page: Page,
  baseURL: string | undefined,
  { brokenFirst = false, missingTiles = false } = {},
) {
  const styles = [`${baseURL}/__e2e/style.json`];
  if (brokenFirst) styles.unshift(`${baseURL}/__e2e/missing-style.json`);
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({ json: { mapStyleUrls: styles } }),
  );
  await page.route("**/__e2e/style.json", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          tiles: {
            type: "raster",
            tiles: [`${baseURL}/__e2e/tiles/{z}/{x}/{y}.png`],
            tileSize: 256,
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#dde3e6" } },
          { id: "tiles", type: "raster", source: "tiles", paint: { "raster-opacity": 0 } },
        ],
      },
    }),
  );
  await page.route("**/__e2e/tiles/**", (route) =>
    missingTiles && /\/\d+\/0\/\d+\.png$/.test(route.request().url())
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
}

export interface RenderedPill {
  cluster: boolean;
  key?: string;
  count?: number;
  country?: string;
  city?: string;
  /** Position in page coordinates. */
  x: number;
  y: number;
}

/** Pills MapLibre placed on screen (map mode only), read through the map instance. */
export async function renderedPills(page: Page): Promise<RenderedPill[]> {
  return page.getByTestId("map").evaluate((el) => {
    type F = {
      properties: Record<string, unknown>;
      geometry: { coordinates: [number, number] };
    };
    const map = (
      el as HTMLElement & {
        gpMap?: {
          queryRenderedFeatures: (o: { layers: string[] }) => F[];
          project: (c: [number, number]) => { x: number; y: number };
          getContainer: () => HTMLElement;
        };
      }
    ).gpMap;
    if (!map) return [];
    const box = map.getContainer().getBoundingClientRect();
    return map.queryRenderedFeatures({ layers: ["gp-destinations"] }).map((f) => {
      const p = map.project(f.geometry.coordinates);
      return {
        cluster: f.properties.cluster === true,
        key: f.properties.key as string | undefined,
        count: f.properties.count as number | undefined,
        country: f.properties.country as string | undefined,
        city: f.properties.cityPl as string | undefined,
        x: box.left + p.x,
        y: box.top + p.y,
      };
    });
  });
}

/** Moves the map without animation (map mode only). */
export async function jumpMap(page: Page, center: [number, number], zoom: number) {
  await page.getByTestId("map").evaluate(
    (el, [c, z]) => {
      const map = (el as HTMLElement & { gpMap?: { jumpTo: (o: object) => void } }).gpMap;
      map?.jumpTo({ center: c, zoom: z });
    },
    [center, zoom] as const,
  );
}

export async function mapZoom(page: Page): Promise<number> {
  return page
    .getByTestId("map")
    .evaluate((el) => (el as HTMLElement & { gpMap?: { getZoom: () => number } }).gpMap!.getZoom());
}

/** Waits until the map (canvas pills) or the flat plan (SVG pills) shows destinations. */
export async function expectPins(page: Page) {
  const map = page.getByTestId("map");
  await expect(map).toHaveAttribute("data-map-mode", /^(map|fallback)$/, { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-pins", /^[1-9]\d*$/, { timeout: 30_000 });
  if ((await map.getAttribute("data-map-mode")) === "fallback") {
    await expect(page.getByTestId("map-pin").first()).toBeVisible();
  } else {
    await expect.poll(async () => (await renderedPills(page)).length).toBeGreaterThan(0);
  }
}

/**
 * Clicks one destination pill in whichever mode the map is in and returns its city. On the real
 * map a cluster is zoomed into until a destination pill shows up.
 */
export async function clickPin(page: Page): Promise<string> {
  const map = page.getByTestId("map");
  await expectPins(page);
  if ((await map.getAttribute("data-map-mode")) === "fallback") {
    const pin = page.getByTestId("map-pin").first();
    const label = (await pin.getAttribute("aria-label")) ?? "";
    await pin.click();
    return label.split(",")[0]!;
  }
  for (let i = 0; i < 8; i++) {
    const pills = await renderedPills(page);
    const box = (await map.boundingBox())!;
    const inside = pills.filter(
      (p) =>
        p.x > box.x + 40 &&
        p.x < box.x + box.width - 60 &&
        p.y > box.y + 30 &&
        p.y < box.y + box.height - 40,
    );
    const pill = inside.find((p) => !p.cluster);
    if (pill) {
      await page.mouse.click(pill.x, pill.y);
      return pill.city!;
    }
    const cluster = inside[0] ?? pills[0];
    if (!cluster) break;
    const before = await mapZoom(page);
    await page.mouse.click(cluster.x, cluster.y);
    await expect.poll(() => mapZoom(page)).toBeGreaterThan(before);
    await page.waitForTimeout(600); // the zoom animation
  }
  throw new Error("no destination pill to click");
}
