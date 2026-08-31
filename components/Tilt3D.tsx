"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Maximum rotation at the card's corners, in degrees. */
  max?: number;
  /** How far the card lifts toward the viewer while hovered, in px. */
  lift?: number;
};

/**
 * Pointer-driven 3D tilt.
 *
 * The depth is real rather than simulated with shadows: the wrapper establishes
 * a perspective, the card rotates within it, and children marked
 * `data-depth="<px>"` are pushed along Z so they parallax against the card face
 * as it turns — the same foreground/background sandwich a cut-out photographic
 * hero gets, from one element.
 *
 * Transforms are written straight to the node. Routing pointer movement through
 * React state would re-render the subtree on every mousemove for a value that
 * only the compositor needs.
 */
export default function Tilt3D({ children, className = "", max = 7, lift = 10 }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, z: 0 });

  const commit = useCallback(() => {
    frameRef.current = 0;
    const card = cardRef.current;
    if (!card) return;
    const { rx, ry, z } = targetRef.current;
    card.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${z.toFixed(1)}px)`;
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(commit);
  }, [commit]);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      // -0.5 … 0.5 across each axis.
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;

      targetRef.current = { rx: -py * max * 2, ry: px * max * 2, z: lift };
      schedule();
    },
    [lift, max, schedule],
  );

  const handleLeave = useCallback(() => {
    targetRef.current = { rx: 0, ry: 0, z: 0 };
    schedule();
  }, [schedule]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return (
    <div className="tilt-scene">
      <div
        ref={cardRef}
        className={`tilt-card ${className}`}
        // Touch devices have no hover, and tilting on tap fights scrolling.
        onPointerMove={(e) => e.pointerType === "mouse" && handleMove(e)}
        onPointerLeave={handleLeave}
      >
        {children}
      </div>
    </div>
  );
}
