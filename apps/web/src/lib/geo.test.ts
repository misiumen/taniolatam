import { describe, expect, it } from "vitest";
import { bbox, greatCircle } from "./geo";

const WAW = { lat: 52.17, lon: 20.97 };
const JFK = { lat: 40.64, lon: -73.78 };
const NRT = { lat: 35.77, lon: 140.39 };
const LAX = { lat: 33.94, lon: -118.41 };

describe("greatCircle", () => {
  it("returns segments + 1 points starting and ending at the airports", () => {
    const pts = greatCircle(WAW, JFK, 64);
    expect(pts).toHaveLength(65);
    expect(pts[0]![0]).toBeCloseTo(WAW.lon, 6);
    expect(pts[0]![1]).toBeCloseTo(WAW.lat, 6);
    expect(pts[64]![0]).toBeCloseTo(JFK.lon, 6);
    expect(pts[64]![1]).toBeCloseTo(JFK.lat, 6);
  });

  it("bends towards the pole like a real long-haul route", () => {
    const pts = greatCircle(WAW, JFK);
    const north = Math.max(...pts.map(([, lat]) => lat));
    expect(north).toBeGreaterThan(WAW.lat + 3);
  });

  it("keeps longitudes continuous across the antimeridian", () => {
    const pts = greatCircle(NRT, LAX);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i]![0] - pts[i - 1]![0])).toBeLessThan(10);
    }
    expect(pts.at(-1)![0]).toBeCloseTo(LAX.lon + 360, 6);
  });

  it("degenerates to a segment for identical points", () => {
    expect(greatCircle(WAW, WAW)).toHaveLength(2);
  });
});

describe("bbox", () => {
  it("spans all points", () => {
    expect(
      bbox([
        [1, 2],
        [-3, 5],
        [4, -1],
      ]),
    ).toEqual([-3, -1, 4, 5]);
  });
});
