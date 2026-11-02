import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_STYLE_URL, MAP_STYLE_FALLBACKS, publicConfig } from "./public-config";

describe("publicConfig", () => {
  it("defaults to OpenFreeMap liberty, then bright, then the MapLibre demo tiles", () => {
    expect(publicConfig({}).mapStyleUrls).toEqual([DEFAULT_MAP_STYLE_URL, ...MAP_STYLE_FALLBACKS]);
  });

  it("prefers MAP_STYLE_URL over the legacy NEXT_PUBLIC_MAP_STYLE_URL", () => {
    const urls = publicConfig({
      MAP_STYLE_URL: "https://maps.example.test/style.json",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://legacy.example.test/style.json",
    }).mapStyleUrls;
    expect(urls[0]).toBe("https://maps.example.test/style.json");
    expect(urls).not.toContain("https://legacy.example.test/style.json");
  });

  it("still honours NEXT_PUBLIC_MAP_STYLE_URL and ignores blank or invalid values", () => {
    expect(
      publicConfig({ MAP_STYLE_URL: " ", NEXT_PUBLIC_MAP_STYLE_URL: "https://legacy.test/s.json" })
        .mapStyleUrls[0],
    ).toBe("https://legacy.test/s.json");
    expect(publicConfig({ MAP_STYLE_URL: "javascript:alert(1)" }).mapStyleUrls[0]).toBe(
      DEFAULT_MAP_STYLE_URL,
    );
  });

  it("does not repeat a fallback that is also the configured style", () => {
    const urls = publicConfig({ MAP_STYLE_URL: MAP_STYLE_FALLBACKS[0] }).mapStyleUrls;
    expect(urls).toEqual([...MAP_STYLE_FALLBACKS]);
  });
});
