/**
 * Globe geometry.
 *
 * The 3D scene itself can't be asserted on in CI (no WebGL, no rAF), so the
 * placement maths is kept pure and pinned here. If a pin lands in the ocean,
 * one of these will say why.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  centroidOf,
  collectGeoStops,
  fibonacciSphere,
  greatCircleArc,
  latLngToVec3,
  ringsToLineSegments,
  rotationForLatLng,
  shortestLngDelta,
  type Vec3,
} from "../lib/globe";

const close = (a: number, b: number, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${a} ≈ ${b}`);

const closeVec = (a: Vec3, b: Vec3, tol = 1e-6) => {
  close(a[0], b[0], tol);
  close(a[1], b[1], tol);
  close(a[2], b[2], tol);
};

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe("latLngToVec3", () => {
  it("puts (0,0) on +Z, facing the default camera", () => {
    closeVec(latLngToVec3(0, 0, 1), [0, 0, 1]);
  });

  it("puts the north pole on +Y and the south pole on -Y", () => {
    closeVec(latLngToVec3(90, 0, 1), [0, 1, 0]);
    closeVec(latLngToVec3(-90, 0, 1), [0, -1, 0]);
    // Longitude is irrelevant at the poles.
    closeVec(latLngToVec3(90, 137, 1), [0, 1, 0]);
  });

  it("puts +90 longitude on +X", () => {
    closeVec(latLngToVec3(0, 90, 1), [1, 0, 0]);
  });

  it("wraps the antimeridian to -Z", () => {
    closeVec(latLngToVec3(0, 180, 1), [0, 0, -1]);
    closeVec(latLngToVec3(0, -180, 1), [0, 0, -1]);
  });

  it("always lands exactly on the sphere", () => {
    for (const lat of [-90, -47, -3, 0, 12, 61, 90]) {
      for (const lng of [-180, -122, -30, 0, 45, 139, 180]) {
        close(length(latLngToVec3(lat, lng, 2.5)), 2.5, 1e-9);
      }
    }
  });
});

describe("rotationForLatLng", () => {
  it("needs no rotation for the point already facing the camera", () => {
    const r = rotationForLatLng(0, 0);
    close(r.x, 0);
    close(r.y, 0);
  });

  it("yaws by the negated longitude", () => {
    close(rotationForLatLng(0, 90).y, -Math.PI / 2);
    close(rotationForLatLng(0, -90).y, Math.PI / 2);
  });

  it("actually brings the target to +Z when applied", () => {
    // Rotating by (x: lat, y: -lng) should map the point onto the camera axis.
    const check = (lat: number, lng: number) => {
      const p = latLngToVec3(lat, lng, 1);
      const { x: rx, y: ry } = rotationForLatLng(lat, lng);

      // Yaw about Y, then pitch about X — the order the scene graph applies.
      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const x1 = p[0] * cy + p[2] * sy;
      const y1 = p[1];
      const z1 = -p[0] * sy + p[2] * cy;

      const cx = Math.cos(rx);
      const sx = Math.sin(rx);
      const y2 = y1 * cx - z1 * sx;
      const z2 = y1 * sx + z1 * cx;

      closeVec([x1, y2, z2], [0, 0, 1], 1e-9);
    };

    check(0, 0);
    check(35.68, 139.69); // Tokyo
    check(-33.87, 151.21); // Sydney
    check(64.15, -21.94); // Reykjavík
    check(43.34, 17.81); // Mostar
  });
});

describe("shortestLngDelta", () => {
  it("takes the short way round the antimeridian", () => {
    assert.equal(shortestLngDelta(170, -170), 20);
    assert.equal(shortestLngDelta(-170, 170), -20);
  });

  it("leaves ordinary deltas alone", () => {
    assert.equal(shortestLngDelta(0, 90), 90);
    assert.equal(shortestLngDelta(10, -10), -20);
  });

  it("stays within (-180, 180]", () => {
    for (let a = -180; a <= 180; a += 7) {
      for (let b = -180; b <= 180; b += 11) {
        const d = shortestLngDelta(a, b);
        assert.ok(d > -180 && d <= 180, `${a}->${b} gave ${d}`);
      }
    }
  });
});

describe("greatCircleArc", () => {
  const tokyo = { lat: 35.68, lng: 139.69 };
  const london = { lat: 51.51, lng: -0.13 };

  it("starts and ends on the surface", () => {
    const arc = greatCircleArc(tokyo, london, { radius: 1, segments: 32 });
    close(length(arc[0]), 1, 1e-6);
    close(length(arc[arc.length - 1]), 1, 1e-6);
  });

  it("bows outward in the middle", () => {
    const arc = greatCircleArc(tokyo, london, { radius: 1, segments: 32 });
    assert.ok(length(arc[16]) > 1.05, "midpoint should lift off the surface");
  });

  it("lifts distant pairs higher than neighbouring ones", () => {
    const near = greatCircleArc({ lat: 35.6, lng: 139.6 }, { lat: 35.7, lng: 139.8 }, { segments: 16 });
    const far = greatCircleArc(tokyo, london, { segments: 16 });
    assert.ok(length(far[8]) > length(near[8]));
  });

  it("returns segments + 1 points", () => {
    assert.equal(greatCircleArc(tokyo, london, { segments: 24 }).length, 25);
  });

  it("does not produce NaN for identical endpoints", () => {
    const arc = greatCircleArc(tokyo, tokyo, { segments: 8 });
    for (const p of arc) for (const c of p) assert.ok(Number.isFinite(c), "NaN in degenerate arc");
  });

  it("does not produce NaN for antipodal endpoints", () => {
    const arc = greatCircleArc({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, { segments: 8 });
    for (const p of arc) for (const c of p) assert.ok(Number.isFinite(c), "NaN in antipodal arc");
  });
});

describe("ringsToLineSegments", () => {
  it("emits paired endpoints and closes the ring", () => {
    // A triangle: 3 points -> 3 edges -> 6 vertices -> 18 floats.
    const rings = [[0, 0, 10, 0, 10, 10]];
    const out = ringsToLineSegments(rings, 1);
    assert.equal(out.length, 18);
  });

  it("skips degenerate rings", () => {
    assert.equal(ringsToLineSegments([[0, 0]], 1).length, 0);
    assert.equal(ringsToLineSegments([[]], 1).length, 0);
  });

  it("keeps every vertex on the sphere", () => {
    const out = ringsToLineSegments([[0, 0, 45, 20, 90, -30]], 3);
    for (let i = 0; i < out.length; i += 3) {
      close(Math.hypot(out[i], out[i + 1], out[i + 2]), 3, 1e-5);
    }
  });

  it("handles the real coastline data without NaN", async () => {
    const { default: land } = await import("../lib/geo/land.json", { with: { type: "json" } });
    const out = ringsToLineSegments(land as number[][], 1);
    assert.ok(out.length > 10_000, "expected a substantial coastline buffer");
    for (let i = 0; i < out.length; i++) assert.ok(Number.isFinite(out[i]), `NaN at ${i}`);
  });
});

describe("fibonacciSphere", () => {
  it("returns three floats per point, all on the sphere", () => {
    const out = fibonacciSphere(200, 1.5);
    assert.equal(out.length, 600);
    for (let i = 0; i < out.length; i += 3) {
      close(Math.hypot(out[i], out[i + 1], out[i + 2]), 1.5, 1e-5);
    }
  });

  it("does not divide by zero for a single point", () => {
    const out = fibonacciSphere(1, 1);
    for (const v of out) assert.ok(Number.isFinite(v));
  });
});

describe("collectGeoStops / centroidOf", () => {
  const days = [
    {
      dayNumber: 1,
      stops: [
        { id: "a", name: "With coords", lat: 10, lng: 20 },
        { id: "b", name: "No coords" },
        { id: "c", name: "Half coords", lat: 5 },
      ],
    },
    { dayNumber: 2, stops: [{ id: "d", name: "Also placed", lat: -10, lng: 20 }] },
  ];

  it("keeps only stops with a usable pair", () => {
    const stops = collectGeoStops(days);
    assert.deepEqual(stops.map((s) => s.id), ["a", "d"]);
    assert.equal(stops[1].dayNumber, 2);
  });

  it("returns null when nothing is placeable", () => {
    assert.equal(centroidOf([]), null);
  });

  it("averages symmetric points to the midpoint", () => {
    const c = centroidOf(collectGeoStops(days))!;
    close(c.lat, 0, 1e-6);
    close(c.lng, 20, 1e-6);
  });

  it("averages across the antimeridian without flipping to the far side", () => {
    // Naive arithmetic averaging of 170 and -170 gives 0 — the wrong hemisphere.
    const c = centroidOf([
      { id: "a", name: "a", dayNumber: 1, lat: 0, lng: 170 },
      { id: "b", name: "b", dayNumber: 1, lat: 0, lng: -170 },
    ])!;
    assert.ok(Math.abs(c.lng) > 179, `expected ≈±180, got ${c.lng}`);
  });
});
