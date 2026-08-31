/**
 * The scroll-choreography math.
 *
 * The rAF loop that consumes these can't be exercised in a headless/hidden tab
 * (the browser never fires requestAnimationFrame), so the timeline is kept as
 * pure functions and verified here instead. What's left in the hook is plumbing:
 * read scroll, call these, write CSS variables.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clamp, lerp, segmentInOut, smoothstep } from "../lib/motion";

describe("clamp", () => {
  it("bounds to the default 0..1 range", () => {
    assert.equal(clamp(-5), 0);
    assert.equal(clamp(0.5), 0.5);
    assert.equal(clamp(5), 1);
  });

  it("honours explicit bounds", () => {
    assert.equal(clamp(150, 0, 100), 100);
  });
});

describe("lerp", () => {
  it("interpolates between endpoints", () => {
    assert.equal(lerp(0, 10, 0), 0);
    assert.equal(lerp(0, 10, 1), 10);
    assert.equal(lerp(0, 10, 0.25), 2.5);
  });

  it("converges toward the target when applied repeatedly", () => {
    let value = 0;
    for (let i = 0; i < 200; i++) value = lerp(value, 100, 0.14);
    assert.ok(Math.abs(value - 100) < 0.001);
  });
});

describe("smoothstep", () => {
  it("clamps outside its edges", () => {
    assert.equal(smoothstep(10, 20, 5), 0);
    assert.equal(smoothstep(10, 20, 25), 1);
  });

  it("is exactly 0.5 at the midpoint", () => {
    assert.equal(smoothstep(0, 10, 5), 0.5);
  });

  it("is monotonically non-decreasing", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const value = smoothstep(0, 1, i / 100);
      assert.ok(value >= previous, `regressed at ${i}`);
      previous = value;
    }
  });

  it("eases in and out rather than moving linearly", () => {
    // Near the edges it should lag a straight line; near the middle, lead it.
    assert.ok(smoothstep(0, 1, 0.1) < 0.1);
    assert.ok(smoothstep(0, 1, 0.9) > 0.9);
  });

  it("does not divide by zero on a degenerate range", () => {
    assert.equal(smoothstep(5, 5, 4), 0);
    assert.equal(smoothstep(5, 5, 6), 1);
  });
});

describe("segmentInOut", () => {
  const at = (p: number) => segmentInOut(p, 0.2, 0.4, 0.6, 0.8);

  it("is dormant before the segment starts", () => {
    assert.equal(at(0.1).active, 0);
    assert.equal(at(0.1).enter, 0);
  });

  it("holds fully active across the plateau", () => {
    assert.equal(at(0.5).active, 1);
  });

  it("is dormant again after the segment ends", () => {
    assert.equal(at(0.9).active, 0);
    assert.equal(at(0.9).exit, 1);
  });

  it("never leaves the 0..1 range anywhere on the timeline", () => {
    for (let i = 0; i <= 200; i++) {
      const { enter, exit, active } = at(i / 200);
      for (const value of [enter, exit, active]) {
        assert.ok(value >= 0 && value <= 1, `out of range at ${i / 200}: ${value}`);
      }
    }
  });

  it("produces a single-peaked envelope", () => {
    // active should rise then fall, never oscillate.
    const samples = Array.from({ length: 101 }, (_, i) => at(i / 100).active);
    const peak = samples.indexOf(Math.max(...samples));
    for (let i = 1; i <= peak; i++) assert.ok(samples[i] >= samples[i - 1]);
    for (let i = peak + 1; i < samples.length; i++) assert.ok(samples[i] <= samples[i - 1]);
  });
});

describe("hero timeline — the values actually written to CSS", () => {
  /** Mirrors the band definitions in hooks/useCinematicScroll.ts. */
  const frame = (p: number) => {
    const introExit = smoothstep(0.03, 0.52, p);
    const parting = segmentInOut(p, 0.1, 0.72, 0.94, 1);
    const split = Math.pow(parting.enter, 1.5);
    return {
      heroOpacity: 1 - introExit,
      heroY: introExit * -140,
      split,
      shadeBottom: 0.45 + parting.active * 0.35,
    };
  };

  it("starts fully legible with nothing displaced", () => {
    const start = frame(0);
    assert.equal(start.heroOpacity, 1);
    // Math.abs normalises -0, which `assert.equal` distinguishes from 0 but CSS
    // does not: `translate3d(0, -0px, 0)` and `0px` render identically.
    assert.equal(Math.abs(start.heroY), 0);
    assert.equal(start.split, 0);
  });

  it("has fully retired the hero copy by the midpoint", () => {
    assert.equal(frame(0.52).heroOpacity, 0);
  });

  it("keeps the composer readable through the first tenth of the runway", () => {
    // The tool must stay usable without scrolling; a steep early fade would
    // pull the input out from under someone who is still typing.
    assert.ok(frame(0.08).heroOpacity > 0.9);
  });

  it("parts the walls monotonically", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const { split } = frame(i / 100);
      assert.ok(split >= previous - 1e-9, `split regressed at ${i / 100}`);
      previous = split;
    }
  });

  it("never drives opacity outside 0..1 anywhere on the runway", () => {
    for (let i = 0; i <= 200; i++) {
      const { heroOpacity, shadeBottom } = frame(i / 200);
      assert.ok(heroOpacity >= 0 && heroOpacity <= 1);
      assert.ok(shadeBottom >= 0 && shadeBottom <= 1);
    }
  });
});
