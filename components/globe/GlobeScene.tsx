"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import landRings from "@/lib/geo/land.json";
import {
  collectGeoStops,
  fibonacciSphere,
  greatCircleArc,
  latLngToVec3,
  ringsToLineSegments,
  rotationForLatLng,
  type GeoStop,
} from "@/lib/globe";

const RADIUS = 1;
const SURFACE = 1.004;

export type GlobeFocus = { lat: number; lng: number } | null;

type Props = {
  focus: GlobeFocus;
  stops: GeoStop[];
  /** Idle spin speed, radians/sec. Zeroed under reduced motion. */
  spin: number;
  pointer: { x: number; y: number };
  /** True while an itinerary is generating — the train runs the journey fast. */
  journeying?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Atmosphere                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fresnel rim glow, rendered on the inside of a slightly larger sphere with
 * additive blending — the standard trick for an atmosphere that brightens toward
 * the limb without any lighting setup.
 */
const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
    gl_FragColor = vec4(uColor, 1.0) * clamp(intensity, 0.0, 1.0) * uStrength;
  }
`;

function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color("#3f7f6d") },
          uStrength: { value: 0.8 },
        },
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh scale={1.22} material={material}>
      <sphereGeometry args={[RADIUS, 48, 48]} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* Static globe furniture                                                      */
/* -------------------------------------------------------------------------- */

function Coastlines() {
  const geometry = useMemo(() => {
    const positions = ringsToLineSegments(landRings as number[][], SURFACE);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#e8dcc8" transparent opacity={0.4} />
    </lineSegments>
  );
}

/** Sparse dot field so the ocean reads as surface rather than void. */
function OceanDots() {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(fibonacciSphere(2600, SURFACE), 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#8fb5a4" size={0.005} sizeAttenuation transparent opacity={0.2} />
    </points>
  );
}

/** Graticule every 30° — cheap depth cue that also reads as "instrument". */
function Graticule() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const push = (lat: number, lng: number) => {
      const [x, y, z] = latLngToVec3(lat, lng, SURFACE);
      positions.push(x, y, z);
    };

    for (let lng = -180; lng < 180; lng += 30) {
      for (let lat = -90; lat < 90; lat += 3) {
        push(lat, lng);
        push(lat + 3, lng);
      }
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lng = -180; lng < 180; lng += 3) {
        push(lat, lng);
        push(lat, lng + 3);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#e8dcc8" transparent opacity={0.06} />
    </lineSegments>
  );
}

/* -------------------------------------------------------------------------- */
/* Trip data                                                                   */
/* -------------------------------------------------------------------------- */

function StopPins({ stops }: { stops: GeoStop[] }) {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.012, 12, 12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      {stops.map((stop) => {
        const [x, y, z] = latLngToVec3(stop.lat, stop.lng, SURFACE + 0.006);
        return (
          <mesh key={stop.id} geometry={geometry} position={[x, y, z]}>
            <meshBasicMaterial color="#d4af37" toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Great-circle hops between consecutive stops, coloured by day. */
function TripArcs({ stops }: { stops: GeoStop[] }) {
  const geometry = useMemo(() => {
    if (stops.length < 2) return null;

    const positions: number[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const arc = greatCircleArc(stops[i], stops[i + 1], { radius: SURFACE, segments: 36 });
      // LineSegments wants pairs, so emit each span's endpoints.
      for (let j = 0; j < arc.length - 1; j++) {
        positions.push(...arc[j], ...arc[j + 1]);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return g;
  }, [stops]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#d4af37" transparent opacity={0.65} toneMapped={false} />
    </lineSegments>
  );
}


/* -------------------------------------------------------------------------- */
/* The train                                                                   */
/* -------------------------------------------------------------------------- */

const ORBIT_RADIUS = 1.2;
/** Tilt of the orbital plane, so the track reads as a ring in perspective. */
const ORBIT_TILT = 0.42;
const CARRIAGES = 5;
/** Angular gap between carriages — tight enough to couple, loose enough to read. */
const CARRIAGE_GAP = 0.052;

/**
 * A point on the orbit at angle `theta`.
 *
 * The path is a circle in the XZ plane, tilted about X. Computing it as a pure
 * function of theta (rather than accumulating a transform) means the carriages
 * can be placed at fixed angular offsets behind the locomotive and stay
 * perfectly coupled no matter how the speed changes.
 */
function orbitPoint(theta: number, target: THREE.Vector3): THREE.Vector3 {
  const x = Math.cos(theta) * ORBIT_RADIUS;
  const z = Math.sin(theta) * ORBIT_RADIUS;
  // Rotate about X by ORBIT_TILT.
  const cos = Math.cos(ORBIT_TILT);
  const sin = Math.sin(ORBIT_TILT);
  return target.set(x, -z * sin, z * cos);
}

/** The circular track the train runs on. */
function OrbitTrack() {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const point = new THREE.Vector3();
    const segments = 240;

    for (let i = 0; i < segments; i++) {
      orbitPoint((i / segments) * Math.PI * 2, point);
      positions.push(point.x, point.y, point.z);
      orbitPoint(((i + 1) / segments) * Math.PI * 2, point);
      positions.push(point.x, point.y, point.z);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#d4af37" transparent opacity={0.22} />
    </lineSegments>
  );
}

/**
 * The train: a locomotive plus carriages riding the orbit.
 *
 * Each carriage is positioned at a fixed angular offset behind the one ahead and
 * oriented by looking at the next point along the path, so the whole rake banks
 * naturally through the tilt of the orbit. Speed ramps up while an itinerary is
 * generating — the journey *is* the loading state.
 */
function Train({ journeying, moving }: { journeying: boolean; moving: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const thetaRef = useRef(0);
  const speedRef = useRef(0.18);

  const bodies = useMemo(() => new THREE.BoxGeometry(0.075, 0.032, 0.036), []);
  const locomotive = useMemo(() => new THREE.BoxGeometry(0.095, 0.042, 0.042), []);

  useEffect(
    () => () => {
      bodies.dispose();
      locomotive.dispose();
    },
    [bodies, locomotive],
  );

  const point = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const step = Math.min(delta, 0.05);

    // Ease between cruising and journey speed rather than snapping.
    const targetSpeed = moving ? (journeying ? 1.5 : 0.18) : 0;
    speedRef.current += (targetSpeed - speedRef.current) * step * 1.8;
    thetaRef.current += speedRef.current * step;

    group.children.forEach((carriage, index) => {
      const theta = thetaRef.current - index * CARRIAGE_GAP;
      orbitPoint(theta, point);
      orbitPoint(theta + 0.02, ahead);
      carriage.position.copy(point);
      carriage.lookAt(ahead);
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: CARRIAGES }, (_, index) => (
        <mesh key={index} geometry={index === 0 ? locomotive : bodies}>
          <meshBasicMaterial
            // The locomotive burns brighter than the carriages behind it.
            color={index === 0 ? "#ffd970" : "#d4af37"}
            toneMapped={false}
            transparent
            opacity={index === 0 ? 1 : Math.max(0.42, 0.92 - index * 0.14)}
          />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dev-only escape hatch.
 *
 * R3F renders inside requestAnimationFrame, which never fires in a hidden or
 * backgrounded tab — so automated visual checks can't capture a frame. This
 * exposes a synchronous render so a screenshot can be taken on demand. It is
 * compiled out of production builds.
 */
function DevRenderHook() {
  const { gl, scene, camera, advance } = useThree();

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as Record<string, unknown>;
    w.__globeRenderFrame = (seconds = 0) => {
      advance(seconds);
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    return () => {
      delete w.__globeRenderFrame;
    };
  }, [gl, scene, camera, advance]);

  return null;
}

export default function GlobeScene({ focus, stops, spin, pointer, journeying = false }: Props) {
  const globeRef = useRef<THREE.Group>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const spunRef = useRef(0);

  // Recompute the resting orientation whenever the trip's focus changes.
  useEffect(() => {
    if (!focus) return;
    const { x, y } = rotationForLatLng(focus.lat, focus.lng);
    targetRef.current = { x, y };
    spunRef.current = 0;
  }, [focus]);

  useFrame((_, delta) => {
    const globe = globeRef.current;
    if (!globe) return;

    const step = Math.min(delta, 0.05); // clamp so a stalled tab doesn't jump

    if (focus) {
      // Ease to the destination and hold it facing the camera.
      globe.rotation.x += (targetRef.current.x - globe.rotation.x) * step * 2.4;
      globe.rotation.y += (targetRef.current.y - globe.rotation.y) * step * 2.4;
    } else {
      // Idle: slow drift, gently tilted so it doesn't look like a flat disc.
      spunRef.current += step * spin;
      globe.rotation.y = spunRef.current;
      globe.rotation.x += (0.32 - globe.rotation.x) * step * 2;
    }

    // Whole-scene parallax toward the cursor.
    globe.rotation.y += pointer.x * 0.16 * step * 8;
    globe.rotation.x += (-pointer.y * 0.1 - globe.rotation.x * 0) * step * 1.2;
  });

  return (
    <>
      <DevRenderHook />
      <Atmosphere />
      {/* Outside the globe group: the train orbits the planet rather than
          rotating with its surface. */}
      <OrbitTrack />
      <Train journeying={journeying} moving={spin > 0 || journeying} />
      <group ref={globeRef}>
        {/* Opaque core so back-facing coastlines are correctly occluded. */}
        <mesh>
          <sphereGeometry args={[RADIUS, 64, 64]} />
          <meshBasicMaterial color="#06100e" />
        </mesh>
        <OceanDots />
        <Graticule />
        <Coastlines />
        <TripArcs stops={stops} />
        <StopPins stops={stops} />
      </group>
    </>
  );
}

export { collectGeoStops };
