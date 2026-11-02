import { beforeAll, describe, expect, it } from "vitest";
import { loadPlaceData } from "@taniolatam/core/node";
import { findDataDir } from "./context";
import { ANYWHERE_SUGGESTION, MAX_SUGGESTIONS, PlaceSuggester } from "./suggest";

let suggester: PlaceSuggester;

beforeAll(async () => {
  suggester = new PlaceSuggester(await loadPlaceData(findDataDir()));
});

describe("PlaceSuggester", () => {
  it("returns nothing for an empty query", () => {
    expect(suggester.suggest("  ")).toEqual([]);
  });

  it("finds Poland as a country, with Polish kind labels, ignoring diacritics", () => {
    const r = suggester.suggest("polsk");
    expect(r[0]).toMatchObject({ kind: "country", label: "Polska", kindLabel: "Kraj" });
    expect(r[0]?.place).toEqual({ kind: "country", code: "PL" });
  });

  it("finds airports by IATA code first", () => {
    const r = suggester.suggest("poz");
    expect(r[0]).toMatchObject({ kind: "airport", place: { kind: "airport", code: "POZ" } });
  });

  it("finds continents, groups and cities", () => {
    expect(suggester.suggest("azja").some((s) => s.kind === "continent")).toBe(true);
    expect(suggester.suggest("warszawa").some((s) => s.kind === "city")).toBe(true);
    expect(suggester.suggest("bangkok").some((s) => s.kind === "city")).toBe(true);
  });

  it("does not list a city twice as group and city", () => {
    const kinds = suggester.suggest("bangkok").map((s) => s.kind);
    expect(kinds).toContain("city");
    expect(kinds).not.toContain("group");
  });

  it("offers Gdziekolwiek only on request: for an empty query and for matching words", () => {
    expect(suggester.suggest("", undefined, { anywhere: true })).toEqual([ANYWHERE_SUGGESTION]);
    expect(suggester.suggest("")).toEqual([]);
    for (const q of ["gdzie", "dowol", "anywhere", "Gdziekolwiek"]) {
      expect(suggester.suggest(q, undefined, { anywhere: true })[0]).toMatchObject({
        kind: "anywhere",
        detail: "Dowolny kierunek na świecie",
      });
      expect(suggester.suggest(q).some((s) => s.kind === "anywhere")).toBe(false);
    }
    // Ordinary queries are unaffected, and the entry does not hijack them.
    const r = suggester.suggest("polsk", undefined, { anywhere: true });
    expect(r[0]?.kind).toBe("country");
    expect(r.some((s) => s.kind === "anywhere")).toBe(false);
  });

  it("caps the result list", () => {
    expect(suggester.suggest("a").length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  });
});
