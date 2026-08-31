import {
  BedDouble,
  Landmark,
  Sparkles,
  TreePalm,
  TramFront,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import type { StopKind } from "./schema";

/**
 * Stop kinds carry three redundant signals — icon, label, and colour — so the
 * category survives colour-blindness, greyscale printing, and screen readers.
 * Colour alone is never the carrier.
 */

export type KindMeta = {
  label: string;
  Icon: LucideIcon;
  /** CSS custom property holding this kind's accent colour. */
  colorVar: string;
};

export const KIND_META: Record<StopKind, KindMeta> = {
  sight: { label: "Sight", Icon: Landmark, colorVar: "--kind-sight" },
  food: { label: "Food", Icon: UtensilsCrossed, colorVar: "--kind-food" },
  transport: { label: "Transport", Icon: TramFront, colorVar: "--kind-transport" },
  stay: { label: "Stay", Icon: BedDouble, colorVar: "--kind-stay" },
  experience: { label: "Experience", Icon: Sparkles, colorVar: "--kind-experience" },
  free: { label: "Free time", Icon: TreePalm, colorVar: "--kind-free" },
};

export function kindMeta(kind: StopKind): KindMeta {
  return KIND_META[kind] ?? KIND_META.sight;
}
