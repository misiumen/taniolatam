import { describe, expect, it } from "vitest";
import {
  CharterMappingError,
  compileField,
  compileMapping,
  compileTransform,
  getPath,
  parseDateAuto,
  parseDateFormat,
  parseIata,
  parseKind,
  parseNumber,
} from "../../src/index.ts";

const t = (spec: string, v: Parameters<ReturnType<typeof compileTransform>>[0]) =>
  compileTransform(spec)(v);

describe("getPath", () => {
  const rec = {
    "kolumna.z.kropka": "csv",
    wylot: { lotnisko: "KTW", "@kod": "X" },
    loty: [{ nr: "E4 1" }, { nr: "E4 2" }],
    cena: { "#text": "999", "@waluta": "PLN" },
  };
  it("reads keys, dot paths, attributes, array indexes (first element by default)", () => {
    expect(getPath(rec, "kolumna.z.kropka")).toBe("csv");
    expect(getPath(rec, "wylot.lotnisko")).toBe("KTW");
    expect(getPath(rec, "wylot.@kod")).toBe("X");
    expect(getPath(rec, "loty.nr")).toBe("E4 1");
    expect(getPath(rec, "loty[1].nr")).toBe("E4 2");
    expect(getPath(rec, "loty.1.nr")).toBe("E4 2");
    expect(getPath(rec, "cena.@waluta")).toBe("PLN");
    expect(getPath(rec, "brak.niczego")).toBeUndefined();
  });
  it("uses #text for an element with attributes", () => {
    expect(compileField("cena")(rec)).toBe("999");
  });
});

describe("scalar parsers", () => {
  it("parseNumber handles Polish and English formats", () => {
    expect(parseNumber("1 299,00 zł")).toBe(1299);
    expect(parseNumber("1.299,50")).toBe(1299.5);
    expect(parseNumber("1,299.50")).toBe(1299.5);
    expect(parseNumber("1.299")).toBe(1299);
    expect(parseNumber("1,299")).toBe(1299);
    expect(parseNumber("899,5")).toBe(899.5);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("PLN")).toBeUndefined();
    expect(parseNumber(42)).toBe(42);
  });
  it("parseDateFormat / parseDateAuto", () => {
    expect(parseDateFormat("05.01.2027", "DD.MM.YYYY")).toBe("2027-01-05");
    expect(parseDateFormat("5/1/27", "D/M/YY")).toBe("2027-01-05");
    expect(parseDateFormat("2027-01-05 06:00", "YYYY-MM-DD")).toBe("2027-01-05");
    expect(parseDateFormat("31.02.2027", "DD.MM.YYYY")).toBeUndefined();
    expect(parseDateAuto("2027-01-05T06:00:00+01:00")).toBe("2027-01-05");
    expect(parseDateAuto("05-01-2027")).toBe("2027-01-05");
    expect(parseDateAuto("20270105")).toBe("2027-01-05");
    expect(parseDateAuto("jutro")).toBeUndefined();
  });
  it("parseIata accepts codes and codes in parentheses only", () => {
    expect(parseIata("krk")).toBe("KRK");
    expect(parseIata("Kraków (KRK)")).toBe("KRK");
    expect(parseIata("KTW - Katowice")).toBe("KTW");
    expect(parseIata("Kraków")).toBeUndefined();
  });
  it("parseKind recognises Polish and English words", () => {
    expect(parseKind("Tylko lot")).toBe("seat-only");
    expect(parseKind("seat-only")).toBe("seat-only");
    expect(parseKind("Wczasy")).toBe("package");
    expect(parseKind("lot + hotel")).toBe("package");
    expect(parseKind("All Inclusive")).toBe("package");
    expect(parseKind("coś innego")).toBeUndefined();
  });
});

describe("transforms", () => {
  it("date, number, int, time, iata", () => {
    expect(t("date:DD.MM.YYYY", "12.01.2027")).toBe("2027-01-12");
    expect(t("date", "12/01/2027")).toBe("2027-01-12");
    expect(t("number", "2.499,00")).toBe(2499);
    expect(t("int", "7 nocy")).toBe(7);
    expect(t("time", "12.01.2027 6:05")).toBe("06:05");
    expect(t("iata", "Hurghada (HRG)")).toBe("HRG");
  });
  it("split, index, first, last", () => {
    expect(t("split:,", "Czartery, Lot ,Egipt")).toEqual(["Czartery", "Lot", "Egipt"]);
    expect(t("index:1", ["a", "b"])).toBe("b");
    expect(t("first", ["a", "b"])).toBe("a");
    expect(t("last", ["a", "b"])).toBe("b");
  });
  it("const, default, concat", () => {
    expect(t("const:PLN", undefined)).toBe("PLN");
    expect(t("default:seat-only", undefined)).toBe("seat-only");
    expect(t("default:x", "y")).toBe("y");
    expect(t("concat:-", ["a", "b"])).toBe("a-b");
    expect(t("concat", ["a", "b"])).toBe("a b");
  });
  it("regex with and without a group number (the pattern may contain colons)", () => {
    expect(t("regex:wylot=([^|]+):1", "wylot=Radom|cel=Antalya")).toBe("Radom");
    expect(t("regex:(\\d{2}):(\\d{2}):2", "06:45")).toBe("45");
    expect(t("regex:\\d+", "7 nocy")).toBe("7");
    expect(t("regex:brak(x)", "abc")).toBeUndefined();
  });
  it("map (case and diacritics ignored, * fallback), upper, lower, mul, div", () => {
    expect(t("map:lot=seat-only,wczasy=package", "WCZASY")).toBe("package");
    expect(t("map:lot=seat-only,*=package", "objazd")).toBe("package");
    expect(t("map:lot=seat-only", "inne")).toBe("inne");
    expect(t("upper", "pln")).toBe("PLN");
    expect(t("lower", "ABC")).toBe("abc");
    expect(t("div:100", "129900")).toBe(1299);
    expect(t("mul:2", "500")).toBe(1000);
  });
  it("rejects unknown or incomplete transforms", () => {
    expect(() => compileTransform("rot13")).toThrow(CharterMappingError);
    expect(() => compileTransform("split")).toThrow(/separator/);
    expect(() => compileTransform("regex:(")).toThrow(CharterMappingError);
    expect(() => compileTransform("map:abc")).toThrow(/key=value/);
    expect(() => compileTransform("div:0")).toThrow(CharterMappingError);
  });
});

describe("compileField / compileMapping", () => {
  it("coalesces several paths, or joins them with concat", () => {
    const r = { a: "", b: "drugi", c: "trzeci" };
    expect(compileField({ path: ["a", "b", "c"] })(r)).toBe("drugi");
    expect(compileField({ path: ["b", "c"], transform: "concat:/" })(r)).toBe("drugi/trzeci");
    expect(compileField({ const: "PLN" })(r)).toBe("PLN");
  });

  it("maps and coerces a record (implicit number/date/time/kind parsing)", () => {
    const map = compileMapping({
      externalId: "id",
      origin: "z",
      destination: "do",
      departDate: "data",
      returnDate: { path: "powrot", transform: "date:DD.MM.YYYY" },
      price: "cena",
      currency: "waluta",
      kind: "typ",
      seatsLeft: "miejsca",
      departTime: "godz",
    });
    expect(
      map({
        id: " A-1 ",
        z: "Katowice Pyrzowice",
        do: "Hurghada",
        data: "12.01.2027",
        powrot: "19.01.2027",
        cena: "1 299,00 zł",
        waluta: "zł",
        typ: "Tylko lot",
        miejsca: "3",
        godz: "0615",
      }),
    ).toEqual({
      externalId: "A-1",
      origin: "Katowice Pyrzowice",
      destination: "Hurghada",
      departDate: "2027-01-12",
      returnDate: "2027-01-19",
      price: 1299,
      currency: "PLN",
      kind: "seat-only",
      seatsLeft: 3,
      departTime: "06:15",
    });
  });

  it("validates target fields", () => {
    const base = { externalId: "a", origin: "b", destination: "c", departDate: "d", price: "e" };
    expect(() => compileMapping({ ...base, colour: "x" } as never)).toThrow(/unknown target/);
    const { price: _p, ...noPrice } = base;
    expect(() => compileMapping(noPrice as never)).toThrow(/price is required/);
    expect(() => compileMapping({ ...base, price: { transform: "nope" } })).toThrow(/price/);
  });
});
