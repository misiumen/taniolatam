import { describe, expect, it } from "vitest";
import { absoluteUrl, DEFAULT_SITE_URL, hostnameOf, isCanonicalHost, siteOrigin } from "./site";

describe("siteOrigin", () => {
  it("defaults to the production address", () => {
    expect(siteOrigin({})).toBe(DEFAULT_SITE_URL);
    expect(siteOrigin({ PUBLIC_SITE_URL: "  " })).toBe(DEFAULT_SITE_URL);
  });

  it("reads PUBLIC_SITE_URL, dropping path and trailing slash", () => {
    expect(siteOrigin({ PUBLIC_SITE_URL: "https://example.pl/" })).toBe("https://example.pl");
    expect(siteOrigin({ PUBLIC_SITE_URL: "http://localhost:3000/x" })).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back for invalid or non-http values", () => {
    expect(siteOrigin({ PUBLIC_SITE_URL: "nie url" })).toBe(DEFAULT_SITE_URL);
    expect(siteOrigin({ PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe(DEFAULT_SITE_URL);
  });
});

describe("absoluteUrl", () => {
  it("joins origin and path", () => {
    expect(absoluteUrl("/szukaj", {})).toBe("https://gdziepolece.pl/szukaj");
    expect(absoluteUrl("szukaj", {})).toBe("https://gdziepolece.pl/szukaj");
    expect(absoluteUrl("/", { PUBLIC_SITE_URL: "https://a.pl" })).toBe("https://a.pl/");
  });
});

describe("hostnameOf / isCanonicalHost", () => {
  it("strips port, case and forwarded lists", () => {
    expect(hostnameOf("GdziePolece.onrender.com:443")).toBe("gdziepolece.onrender.com");
    expect(hostnameOf("gdziepolece.pl, proxy.internal")).toBe("gdziepolece.pl");
    expect(hostnameOf(null)).toBe("");
  });

  it("accepts only the canonical host", () => {
    expect(isCanonicalHost("gdziepolece.pl", {})).toBe(true);
    expect(isCanonicalHost("GDZIEPOLECE.PL:443", {})).toBe(true);
    expect(isCanonicalHost("gdziepolece.onrender.com", {})).toBe(false);
    expect(isCanonicalHost("www.gdziepolece.pl", {})).toBe(false);
    expect(isCanonicalHost("127.0.0.1:3100", {})).toBe(false);
    expect(isCanonicalHost(null, {})).toBe(false);
    expect(isCanonicalHost("127.0.0.1:3100", { PUBLIC_SITE_URL: "http://127.0.0.1:3100" })).toBe(
      true,
    );
  });
});
