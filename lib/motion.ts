/**
 * Scroll-choreography math.
 *
 * These are the primitives a scrubbed timeline needs: clamp a value, ease it,
 * and describe a band of the timeline that fades in, holds, then fades out.
 *
 * One deliberate departure from the reference implementation this is modelled
 * on: it keyed every segment to **absolute pixel offsets** against a fixed
 * 3700px runway, which silently re-times itself on any viewport that isn't the
 * author's. Here the timeline is normalised to 0..1 across whatever runway
 * exists, so a phone and an ultrawide see the same choreography.
 */

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Hermite ease between two edges — smooth first derivative at both ends. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

export type Segment = {
  /** 0..1 ramp as the segment comes in. */
  enter: number;
  /** 0..1 ramp as it leaves. */
  exit: number;
  /** enter × (1 - exit): peaks at 1 while the segment holds. */
  active: number;
};

/**
 * A four-point envelope: rises over [a,b], holds over [b,c], falls over [c,d].
 */
export function segmentInOut(
  progress: number,
  a: number,
  b: number,
  c: number,
  d: number,
): Segment {
  const enter = smoothstep(a, b, progress);
  const exit = smoothstep(c, d, progress);
  return { enter, exit, active: enter * (1 - exit) };
}

/** Round to a fixed precision before writing to the DOM — fewer style invalidations. */
export function px(value: number, precision = 2): string {
  return `${value.toFixed(precision)}px`;
}

export function num(value: number, precision = 4): string {
  return value.toFixed(precision);
}
