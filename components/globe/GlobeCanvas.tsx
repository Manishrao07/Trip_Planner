"use client";

import { Canvas } from "@react-three/fiber";

import type { GeoStop } from "@/lib/globe";
import GlobeScene from "./GlobeScene";

type Props = {
  focus: { lat: number; lng: number } | null;
  stops: GeoStop[];
  spin: number;
  pointer: { x: number; y: number };
};

/**
 * The R3F entry point — and the module boundary that keeps Three.js out of the
 * initial bundle.
 *
 * `Canvas` transitively imports the whole of three, so importing it anywhere
 * eagerly-loaded defeats the code split no matter how the scene below is
 * loaded. Everything that touches R3F lives at or below this file, and this
 * file is only ever reached through a `dynamic()` import in Globe.tsx.
 */
export default function GlobeCanvas({ focus, stops, spin, pointer }: Props) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.05], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      // `alpha` keeps the page background visible behind the globe.
      style={{ background: "transparent" }}
    >
      <GlobeScene focus={focus} stops={stops} spin={spin} pointer={pointer} />
    </Canvas>
  );
}
