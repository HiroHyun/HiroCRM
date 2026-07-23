// The one module that owns rating normalization: null is the stored
// "Unknown" state; every write path funnels ""/"Unknown"/junk → null here.

import { strings } from "./strings";
import type { Rating } from "./types";

export const RATINGS = ["A", "B", "C"] as const satisfies readonly Rating[];

/** Trim + case-insensitive a/b/c → canonical; everything else → null. */
export function normalizeRating(input: unknown): Rating | null {
  if (typeof input !== "string") return null;
  const needle = input.trim().toUpperCase();
  return (RATINGS as readonly string[]).includes(needle)
    ? (needle as Rating)
    : null;
}

/** null renders as "Unknown" everywhere; storage stays null. */
export function ratingLabel(rating: Rating | null): string {
  return rating === null ? strings.rating.unknown : strings.rating[rating];
}
