import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AirlineDataError, AirlineIndex, parseAirlines } from "../src/index.ts";
import { loadAirlineIndex } from "../src/node.ts";

describe("parseAirlines", () => {
  it("normalises codes and skips malformed entries with warnings", () => {
    const { airlines, warnings } = parseAirlines({
      w6: { name: " Wizz Air ", type: "lowcost", country: "hu" },
      LO: { name: "LOT", type: "scheduled" },
      E4: { name: "Enter Air", type: "charter", country: "" },
      XX: { name: "Bad type", type: "budget" },
      "TOO-LONG": { name: "x", type: "lowcost" },
      YY: null,
    });
    expect(airlines).toEqual({
      W6: { name: "Wizz Air", type: "lowcost", country: "HU" },
      LO: { name: "LOT", type: "scheduled" },
      E4: { name: "Enter Air", type: "charter" },
    });
    expect(warnings).toHaveLength(3);
  });

  it("rejects a non-object file", () => {
    expect(() => parseAirlines([])).toThrow(AirlineDataError);
    expect(() => parseAirlines(null)).toThrow(AirlineDataError);
  });
});

describe("AirlineIndex", () => {
  const idx = AirlineIndex.fromJson({
    W6: { name: "Wizz Air", type: "lowcost", country: "HU" },
    LH: { name: "Lufthansa", type: "scheduled" },
    // The file wins over the hand-kept lists.
    BT: { name: "airBaltic", type: "scheduled" },
  });

  it("looks up names and types case-insensitively", () => {
    expect(idx.size).toBe(3);
    expect(idx.name("w6")).toBe("Wizz Air");
    expect(idx.get("W6")).toEqual({ name: "Wizz Air", type: "lowcost", country: "HU" });
    expect(idx.type("LH")).toBe("scheduled");
    expect(idx.type("BT")).toBe("scheduled");
    expect(idx.names(["W6", "ZZ"])).toEqual(["Wizz Air", "ZZ"]);
  });

  it("falls back to classifyCarrier for codes the file lacks", () => {
    expect(idx.name("FR")).toBeUndefined();
    expect(idx.type("FR")).toBe("lowcost");
    expect(idx.type("E4")).toBe("charter");
    expect(idx.type(undefined)).toBe("scheduled");
    expect(new AirlineIndex().type("W6")).toBe("lowcost");
  });
});

describe("loadAirlineIndex", () => {
  const dirs: string[] = [];
  const tempDir = async () => {
    const d = await mkdtemp(join(tmpdir(), "gp-airlines-"));
    dirs.push(d);
    return d;
  };
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it("returns an empty index when the file is missing", async () => {
    const idx = await loadAirlineIndex(await tempDir());
    expect(idx.size).toBe(0);
    expect(idx.type("FR")).toBe("lowcost");
  });

  it("reads and validates airlines.json", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, "airlines.json"),
      JSON.stringify({ W6: { name: "Wizz Air", type: "lowcost", country: "HU" } }),
    );
    expect((await loadAirlineIndex(dir)).name("W6")).toBe("Wizz Air");

    const bad = await tempDir();
    await writeFile(join(bad, "airlines.json"), "{nope");
    await expect(loadAirlineIndex(bad)).rejects.toThrow(AirlineDataError);
  });
});
