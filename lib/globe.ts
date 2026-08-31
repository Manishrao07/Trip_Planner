/**
 * Globe geometry.
 *
 * Deliberately free of any Three.js import: everything here is plain arithmetic
 * on tuples, so it can be unit-tested in Node without a WebGL context. The scene
 * component turns these numbers into buffers; this file decides *where things go*.
 */

export type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/**
 * Map a geographic coordinate onto a sphere.
 *
 * Convention: +Y is north, and the point at (lat 0, lng 0) sits on +Z facing the
 * default camera. Picking this now means `rotationForLatLng` below is a simple
 * negation rather than a pile of empirical offsets.
 */
export function latLngToVec3(lat: number, lng: number, radius = 1): Vec3 {
  const phi = (90 - lat) * DEG; // polar angle from +Y
  const theta = lng * DEG; // azimuth, 0 at +Z

  const sinPhi = Math.sin(phi);
  return [
    radius * sinPhi * Math.sin(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.cos(theta),
  ];
}

/**
 * Euler angles that rotate the globe so `(lat, lng)` faces the camera.
 *
 * With the convention above, yaw is just the negated longitude and pitch the
 * latitude — which is why the convention was chosen.
 */
export function rotationForLatLng(lat: number, lng: number): { x: number; y: number } {
  return { x: lat * DEG, y: -lng * DEG };
}

/** Shortest angular distance between two longitudes, in degrees (-180, 180]. */
export function shortestLngDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Points along the great circle between two coordinates, bowed outward from the
 * surface so the arc reads as a flight path rather than a scratch on the sphere.
 *
 * The lift scales with angular separation: neighbouring stops get an almost-flat
 * hop, cross-continent legs get a tall arc.
 */
export function greatCircleArc(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  options: { radius?: number; segments?: number; lift?: number } = {},
): Vec3[] {
  const radius = options.radius ?? 1;
  const segments = Math.max(2, options.segments ?? 48);

  const a = normalize(latLngToVec3(from.lat, from.lng, 1));
  const b = normalize(latLngToVec3(to.lat, to.lng, 1));

  const cosOmega = Math.min(1, Math.max(-1, dot(a, b)));
  const omega = Math.acos(cosOmega);
  const lift = options.lift ?? Math.min(0.32, 0.04 + (omega / Math.PI) * 0.55);

  const points: Vec3[] = [];

  // Coincident (or antipodal) endpoints have no unique great circle; a straight
  // interpolation is both correct enough and numerically safe.
  const degenerate = omega < 1e-6 || Math.abs(Math.PI - omega) < 1e-6;
  const sinOmega = Math.sin(omega);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    let p: Vec3;
    if (degenerate) {
      p = normalize([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ]);
    } else {
      const wa = Math.sin((1 - t) * omega) / sinOmega;
      const wb = Math.sin(t * omega) / sinOmega;
      p = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    }

    // Bow the middle of the arc away from the surface.
    const scale = radius * (1 + lift * Math.sin(Math.PI * t));
    points.push([p[0] * scale, p[1] * scale, p[2] * scale]);
  }

  return points;
}

/**
 * Turn the vendored coastline rings into a flat position array for LineSegments.
 *
 * LineSegments wants pairs, so each edge contributes both endpoints; rings are
 * closed by joining the last point back to the first.
 */
export function ringsToLineSegments(rings: number[][], radius = 1): Float32Array {
  const positions: number[] = [];

  for (const ring of rings) {
    const pointCount = ring.length / 2;
    if (pointCount < 2) continue;

    for (let i = 0; i < pointCount; i++) {
      const next = (i + 1) % pointCount;

      const a = latLngToVec3(ring[i * 2 + 1], ring[i * 2], radius);
      const b = latLngToVec3(ring[next * 2 + 1], ring[next * 2], radius);

      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  return new Float32Array(positions);
}

/** Evenly distributed points on a sphere — used for the ocean dot field. */
export function fibonacciSphere(count: number, radius = 1): Float32Array {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }

  return positions;
}

/** Every stop that carries usable coordinates, in itinerary order. */
export type GeoStop = {
  id: string;
  name: string;
  dayNumber: number;
  lat: number;
  lng: number;
};

export function collectGeoStops(
  days: Array<{ dayNumber: number; stops: Array<{ id: string; name: string; lat?: number; lng?: number }> }>,
): GeoStop[] {
  const out: GeoStop[] = [];
  for (const day of days) {
    for (const stop of day.stops) {
      if (typeof stop.lat === "number" && typeof stop.lng === "number") {
        out.push({ id: stop.id, name: stop.name, dayNumber: day.dayNumber, lat: stop.lat, lng: stop.lng });
      }
    }
  }
  return out;
}

/**
 * A focus point for the camera when the itinerary has no explicit centre:
 * the mean of its stops, with longitude averaged as a unit vector so a trip
 * straddling the antimeridian doesn't average to the wrong side of the planet.
 */
export function centroidOf(stops: GeoStop[]): { lat: number; lng: number } | null {
  if (stops.length === 0) return null;

  let x = 0;
  let y = 0;
  let z = 0;

  for (const stop of stops) {
    const [px, py, pz] = latLngToVec3(stop.lat, stop.lng, 1);
    x += px;
    y += py;
    z += pz;
  }

  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return { lat: stops[0].lat, lng: stops[0].lng };

  x /= len;
  y /= len;
  z /= len;

  return {
    lat: Math.asin(Math.min(1, Math.max(-1, y))) / DEG,
    lng: Math.atan2(x, z) / DEG,
  };
}
