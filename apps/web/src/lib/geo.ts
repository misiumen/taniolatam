export interface LatLon {
  lat: number;
  lon: number;
}

const RAD = Math.PI / 180;

/**
 * Points along the great circle from `a` to `b` as `[lon, lat]` pairs (GeoJSON order), both ends
 * included. Longitudes are unwrapped (they may leave −180…180) so a route over the antimeridian
 * stays one continuous line instead of jumping across the whole map.
 */
export function greatCircle(a: LatLon, b: LatLon, segments = 64): [number, number][] {
  const φ1 = a.lat * RAD;
  const λ1 = a.lon * RAD;
  const φ2 = b.lat * RAD;
  const λ2 = b.lon * RAD;
  const h =
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  const sinD = Math.sin(d);
  // Same point, or (almost) antipodal where the great circle is undefined: a straight segment.
  if (d < 1e-9 || sinD < 1e-6) {
    return [
      [a.lon, a.lat],
      [b.lon, b.lat],
    ];
  }
  const out: [number, number][] = [];
  let prev: number | undefined;
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD;
    let lon = Math.atan2(y, x) / RAD;
    if (prev !== undefined) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    prev = lon;
    out.push([lon, lat]);
  }
  return out;
}

/** Bounding box `[minLon, minLat, maxLon, maxLat]` of `[lon, lat]` points. */
export function bbox(points: readonly [number, number][]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}
