import type { Offer } from "@taniolatam/core";
import { describe, expect, it } from "vitest";
import { openJawLegs, verifyLinks } from "./links";

const base: Offer = {
  id: "x",
  price: 1000,
  currency: "PLN",
  origin: "WAW",
  destination: "BKK",
  departDate: "2027-03-01",
  returnDate: "2027-03-15",
  stops: 1,
  carriers: ["LO"],
  carrierType: "scheduled",
  source: "mock",
  fetchedAt: "2027-01-01T00:00:00Z",
  freshness: "cached",
  deepLink: "https://offer.example/out",
};

describe("openJawLegs", () => {
  it("is undefined for an ordinary round trip", () => {
    expect(openJawLegs(base)).toBeUndefined();
    expect(
      openJawLegs({
        ...base,
        legs: [
          { origin: "WAW", destination: "BKK", departAt: "2027-03-01T10:00" },
          { origin: "BKK", destination: "WAW", departAt: "2027-03-15T10:00" },
        ],
      }),
    ).toBeUndefined();
  });

  it("reads both legs of an open-jaw offer, with per-leg links", () => {
    const offer: Offer = {
      ...base,
      returnTo: "KRK",
      legs: [
        {
          origin: "WAW",
          destination: "BKK",
          departAt: "2027-03-01",
          deepLink: "https://a.example",
        },
        {
          origin: "BKK",
          destination: "KRK",
          departAt: "2027-03-15",
          deepLink: "https://b.example",
        },
      ],
    };
    const legs = openJawLegs(offer)!;
    expect(legs.map((l) => `${l.origin}-${l.destination}@${l.date}`)).toEqual([
      "WAW-BKK@2027-03-01",
      "BKK-KRK@2027-03-15",
    ]);
    const links = verifyLinks(offer);
    expect(links.some((l) => l.leg === "out")).toBe(true);
    expect(links.some((l) => l.leg === "back")).toBe(true);
    expect(links.find((l) => l.leg === "back")?.label).not.toContain("powrót");
  });

  it("falls back to returnTo when there are no legs", () => {
    const legs = openJawLegs({ ...base, returnTo: "KRK" })!;
    expect(legs[1]).toMatchObject({ origin: "BKK", destination: "KRK", date: "2027-03-15" });
  });
});
