/**
 * The parallax scenery.
 *
 * Self-authored SVG silhouettes rather than photographs — they scale to any
 * viewport without an asset pipeline, recolour with the theme, weigh a couple of
 * kilobytes, and carry no licensing baggage.
 *
 * Aerial perspective does the depth work: distant ridges wash toward the sky
 * colour, near ones fall to near-ink. Purely decorative, so the whole set is
 * hidden from assistive technology by the parent.
 */

const FAR_RIDGE =
  "M0,420 L0,296 C118,268 196,318 298,288 C420,252 498,300 618,264 C740,228 818,286 938,254 C1058,222 1158,276 1278,248 C1348,232 1400,254 1440,242 L1440,420 Z";

const MID_RIDGE =
  "M0,420 L0,338 L118,258 L208,316 L318,232 L428,298 L520,242 L638,320 L758,248 L878,306 L998,228 L1118,294 L1238,240 L1348,298 L1440,254 L1440,420 Z";

/** One canyon wall, drawn leaning right; the mirror gives us the other half. */
const WALL =
  "M0,480 L0,96 C58,122 92,178 138,212 C196,254 244,306 292,352 C338,396 382,432 414,480 Z";

type WallProps = { side: "left" | "right"; className?: string };

export function RidgeFar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 420"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={FAR_RIDGE} fill="color-mix(in oklab, #3e7c6a 26%, var(--bg))" />
    </svg>
  );
}

export function RidgeMid({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 420"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={MID_RIDGE} fill="color-mix(in oklab, #23463e 55%, var(--bg))" />
    </svg>
  );
}

export function RidgeWall({ side, className }: WallProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 720 480"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={WALL}
        fill="color-mix(in oklab, var(--ink) 82%, #23463e)"
        // The right wall is the left one mirrored about the viewBox centre.
        transform={side === "right" ? "translate(720,0) scale(-1,1)" : undefined}
      />
    </svg>
  );
}
