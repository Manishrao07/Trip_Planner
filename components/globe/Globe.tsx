"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { GeoStop } from "@/lib/globe";

/**
 * The globe's loading boundary.
 *
 * Three.js is ~600 kB — far too much to sit in the initial bundle for a page
 * whose job is to accept a sentence of text. Nothing in this file may import
 * `@react-three/*` or `three`: a single eager import of `Canvas` pulls the whole
 * renderer into the entry chunk and silently undoes the split. The canvas lives
 * behind `dynamic(..., { ssr: false })` (it needs a WebGL context the server
 * doesn't have) and only mounts once the browser is idle, so it never competes
 * with the composer becoming interactive.
 */
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false });

type Props = {
  focus: { lat: number; lng: number } | null;
  stops: GeoStop[];
  className?: string;
};

function useIdleMount(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    // Idle callbacks are throttled to a standstill in a background or hidden
    // tab, so `requestIdleCallback` alone can mean the globe never mounts at
    // all. Race it against a hard deadline: idle if we get it, bounded if not.
    const timer = setTimeout(() => setReady(true), 1500);
    const handle =
      typeof w.requestIdleCallback === "function"
        ? w.requestIdleCallback(() => setReady(true), { timeout: 1200 })
        : undefined;

    return () => {
      clearTimeout(timer);
      if (handle !== undefined) w.cancelIdleCallback?.(handle);
    };
  }, []);

  return ready;
}

/** True when the device is likely to make a poor job of a WebGL scene. */
function useCanRenderGlobe(): boolean {
  const [can, setCan] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const cores = navigator.hardwareConcurrency ?? 4;
      // Bail on no WebGL, or on very low-core devices where the scene would
      // cost more than it's worth.
      setCan(Boolean(gl) && cores > 2);
    } catch {
      setCan(false);
    }
  }, []);

  return can;
}

export default function Globe({ focus, stops, className }: Props) {
  const ready = useIdleMount();
  const canRender = useCanRenderGlobe();
  const [reduceMotion, setReduceMotion] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Pointer parallax, throttled to the frame via a ref + rAF commit.
  useEffect(() => {
    if (reduceMotion || !window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: event.clientX / window.innerWidth - 0.5,
        y: event.clientY / window.innerHeight - 0.5,
      };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          setPointer(pointerRef.current);
        });
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  if (!canRender) return null;

  return (
    <div className={className} aria-hidden="true">
      {ready && (
        <GlobeCanvas
          focus={focus}
          stops={stops}
          spin={reduceMotion ? 0 : 0.05}
          pointer={reduceMotion ? { x: 0, y: 0 } : pointer}
        />
      )}
    </div>
  );
}
