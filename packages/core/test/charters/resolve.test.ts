import { beforeAll, describe, expect, it } from "vitest";
import type { AirlineIndex, PlaceIndex } from "../../src/index.ts";
import {
  CharterPlaceResolver,
  normalizeAirlineName,
  resolveCharterAirline,
} from "../../src/index.ts";
import { airlinesPromise, placesPromise } from "./helpers.ts";

let places: PlaceIndex;
let airlines: AirlineIndex;
let resolver: CharterPlaceResolver;
const code = (s: string) => resolver.resolve(s)?.code;

beforeAll(async () => {
  places = await placesPromise;
  airlines = await airlinesPromise;
  resolver = new CharterPlaceResolver(places, { "Riwiera Olimpijska": "SKG" });
});

describe("CharterPlaceResolver: Polish airports (reference data)", () => {
  it.each([
    ["Warszawa Chopina", "WAW"],
    ["Warszawa Modlin", "WMI"],
    ["Katowice Pyrzowice", "KTW"],
    ["Kraków Balice", "KRK"],
    ["Gdańsk Rębiechowo", "GDN"],
    ["Wrocław Strachowice", "WRO"],
    ["Poznań Ławica", "POZ"],
    ["Rzeszów Jasionka", "RZE"],
    ["Lublin Świdnik", "LUZ"],
    ["Bydgoszcz", "BZG"],
    ["Łódź Lublinek", "LCJ"],
    ["Szczecin Goleniów", "SZZ"],
    ["Radom", "RDO"],
    ["Olsztyn Mazury", "SZY"],
    ["Zielona Góra Babimost", "IEG"],
  ])("%s → %s", (name, iata) => {
    expect(code(name)).toBe(iata);
  });

  it("ignores case, diacritics and punctuation", () => {
    expect(code("KATOWICE-PYRZOWICE")).toBe("KTW");
    expect(code("Krakow (Balice)")).toBe("KRK");
    expect(code("lodz lublinek")).toBe("LCJ");
    expect(code("Warszawa")).toBe("WAW");
  });

  it("falls back to the leading city name and drops filler words", () => {
    expect(code("Gdańsk im. Lecha Wałęsy")).toBe("GDN");
    expect(code("Port lotniczy Katowice")).toBe("KTW");
  });
});

describe("CharterPlaceResolver: destinations", () => {
  it.each([
    ["Hurghada", "HRG"],
    ["Antalya", "AYT"],
    ["Heraklion", "HER"],
    ["Fuerteventura", "FUE"],
    ["Rodos", "RHO"],
    ["Korfu", "CFU"],
    ["Teneryfa", "TFS"],
    ["Szarm el-Szejk", "SSH"],
    ["Hurghada (HRG)", "HRG"],
    ["HRG", "HRG"],
    ["Egipt / Hurghada", "HRG"],
    ["Hurghada, Egipt", "HRG"],
    ["Kreta / Heraklion", "HER"],
    ["Chania (Kreta)", "CHQ"],
    ["Kreta", "HER"],
    ["Riwiera Olimpijska", "SKG"],
  ])("%s → %s", (name, iata) => {
    expect(code(name)).toBe(iata);
  });

  it("reports how the code was found and returns undefined for unknown names", () => {
    expect(resolver.resolve("Katowice Pyrzowice")?.via).toBe("alias");
    expect(resolver.resolve("HRG")?.via).toBe("iata");
    expect(resolver.resolve("Antalya")?.via).toBe("name");
    expect(resolver.resolve("Egipt / Hurghada")?.via).toBe("partial");
    expect(resolver.resolve("Lotnisko Nieistniejące")).toBeUndefined();
    expect(resolver.resolve("")).toBeUndefined();
  });
});

describe("airline names", () => {
  it("normalizeAirlineName drops company forms", () => {
    expect(normalizeAirlineName("Enter Air Sp. z o.o.")).toBe("enter air");
    expect(normalizeAirlineName("SMARTWINGS, a.s.")).toBe("smartwings");
  });

  it("resolves feed airline names to IATA codes", () => {
    expect(resolveCharterAirline("Enter Air Sp. z o.o.", airlines)).toBe("E4");
    expect(resolveCharterAirline("Smartwings", airlines)).toBe("QS");
    expect(resolveCharterAirline("Travel Service", airlines)).toBe("QS");
    expect(resolveCharterAirline("LOT", airlines)).toBe("LO");
    expect(resolveCharterAirline("Corendon Airlines", airlines)).toBe("XC");
    expect(resolveCharterAirline("E4", airlines)).toBe("E4");
    expect(resolveCharterAirline("Linia Zmyślona", airlines)).toBeUndefined();
    expect(airlines.findByName("Air Cairo")).toBe("SM");
  });
});
