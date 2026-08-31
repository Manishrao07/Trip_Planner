"use client";

import { useEffect, useRef, type RefObject } from "react";

import { clamp, lerp, num, px, segmentInOut, smoothstep } from "@/lib/motion";

/**
 * Drives the hero's scroll choreography.
 *
 * Design notes:
 *
 * - **One rAF loop, CSS custom properties only.** Every frame writes a handful of
 *   variables onto a single element. React never re-renders during a scroll, and
 *   the browser only composites transforms/opacity — no layout, no paint.
 * - **The loop parks itself.** It runs while there's motion left to settle and
 *   stops once scroll and pointer are both within epsilon of their targets, so an
 *   idle page costs nothing.
 * - **Inertia is opt-out.** Under `prefers-reduced-motion` the smoothing is
 *   bypassed and pointer parallax is pinned to zero: the composition still
 *   scrubs with the scrollbar, it just doesn't glide or follow the cursor.
 */

const SCROLL_EASE = 0.14;
const POINTER_EASE = 0.12;
const SCROLL_EPSILON = 0.08;
const POINTER_EPSILON = 0.001;

export function useCinematicScroll(
  rigRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
) {
  // Kept in a ref so the animation loop never triggers a React render.
  const stateRef = useRef({
    targetScroll: 0,
    smoothScroll: 0,
    targetPointerX: 0,
    targetPointerY: 0,
    pointerX: 0,
    pointerY: 0,
    initialized: false,
    frame: 0,
    pending: false,
  });

  useEffect(() => {
    const rig = rigRef.current;
    const stage = stageRef.current;
    if (!rig || !stage) return;

    const state = stateRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // `state` outlives this effect. Under StrictMode the effect mounts, tears
    // down, and remounts; if a cancelled frame left `pending` set, every future
    // requestTick would early-return and the loop would never restart.
    state.pending = false;

    const scrollDistance = () => {
      const runway = rig.offsetHeight - window.innerHeight;
      if (runway <= 0) return 0;
      return clamp(-rig.getBoundingClientRect().top, 0, runway);
    };

    const write = (name: string, value: string) => {
      stage.style.setProperty(name, value);
    };

    const update = () => {
      state.pending = false;

      const runway = Math.max(1, rig.offsetHeight - window.innerHeight);
      state.targetScroll = scrollDistance();

      if (!state.initialized || reduceMotion.matches) {
        state.smoothScroll = state.targetScroll;
        state.initialized = true;
      } else {
        state.smoothScroll = lerp(state.smoothScroll, state.targetScroll, SCROLL_EASE);
      }
      if (Math.abs(state.smoothScroll - state.targetScroll) < SCROLL_EPSILON) {
        state.smoothScroll = state.targetScroll;
      }

      if (reduceMotion.matches) {
        state.pointerX = 0;
        state.pointerY = 0;
      } else {
        state.pointerX = lerp(state.pointerX, state.targetPointerX, POINTER_EASE);
        state.pointerY = lerp(state.pointerY, state.targetPointerY, POINTER_EASE);
      }

      // Normalised timeline: 0 at the top of the rig, 1 when it's fully scrolled.
      const p = clamp(state.smoothScroll / runway);

      // --- Timeline bands -------------------------------------------------
      const introExit = smoothstep(0.03, 0.52, p);
      const parting = segmentInOut(p, 0.1, 0.72, 0.94, 1);
      const split = Math.pow(parting.enter, 1.5);
      const depth = smoothstep(0, 1, p);

      // --- Pointer parallax ------------------------------------------------
      write("--mx", num(state.pointerX));
      write("--my", num(state.pointerY));

      // --- Ridge layers, each drifting at its own rate ----------------------
      write("--ridge-far-y", px(depth * -28));
      write("--ridge-far-scale", num(1.02 + depth * 0.08));
      write("--ridge-mid-y", px(depth * -54));
      write("--ridge-mid-scale", num(1.04 + depth * 0.12));
      write("--ridge-near-y", px(depth * -96 - split * 120));
      write("--ridge-near-scale", num(1.06 + split * 0.5));
      write("--split", num(split));

      // --- Scrim rising as the layers separate ------------------------------
      write("--shade-top", num(parting.active * 0.3));
      write("--shade-mid", num(parting.active * 0.22));
      write("--shade-bottom", num(0.45 + parting.active * 0.35));

      // --- Foreground content lifting away ----------------------------------
      write("--hero-y", px(introExit * -140));
      write("--hero-scale", num(1 - introExit * 0.06));
      write("--hero-opacity", num(1 - introExit));
      write("--scroll-cue-opacity", num(1 - smoothstep(0.01, 0.16, p)));

      const settled =
        Math.abs(state.smoothScroll - state.targetScroll) <= SCROLL_EPSILON &&
        Math.abs(state.pointerX - state.targetPointerX) <= POINTER_EPSILON &&
        Math.abs(state.pointerY - state.targetPointerY) <= POINTER_EPSILON;

      if (!settled) requestTick();
    };

    const requestTick = () => {
      if (state.pending) return;
      state.pending = true;
      state.frame = requestAnimationFrame(update);
    };

    const onScroll = () => requestTick();
    const onResize = () => requestTick();
    const onPointerMove = (event: PointerEvent) => {
      state.targetPointerX = event.clientX / window.innerWidth - 0.5;
      state.targetPointerY = event.clientY / window.innerHeight - 0.5;
      requestTick();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // Pointer parallax is a mouse affordance; on touch it would fight scrolling.
    if (window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }
    reduceMotion.addEventListener("change", requestTick);

    requestTick();

    return () => {
      cancelAnimationFrame(state.frame);
      state.pending = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      reduceMotion.removeEventListener("change", requestTick);
    };
  }, [rigRef, stageRef]);
}
