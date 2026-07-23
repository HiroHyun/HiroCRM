// The one rep validation/lookup module: name normalization,
// lookups, and the leadCount aggregate all live here so rep routes and lead
// routes (existence-checking repId on write) share one source of truth.

import { count, eq } from "drizzle-orm";
import { getDb } from "../db";
import { leads, reps, type Rep } from "../db/schema";
import { FIELD_LIMITS } from "./lead-validation";

/** name.trim().toLowerCase() — JS Unicode fold, matches the DB's stored key. */
export function repNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Required free-text field: non-blank string within the rep-name length
 * ceiling (FIELD_LIMITS.repName), stored trimmed. */
export function parseRepName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > FIELD_LIMITS.repName) return null;
  return trimmed;
}

/** Existing rep holding this nameKey, if any (dup pre-check, PATCH excludes self). */
export function findRepByNameKey(nameKey: string): Rep | null {
  return getDb().select().from(reps).where(eq(reps.nameKey, nameKey)).get() ?? null;
}

/** Rep by id, or null (FK existence-check for repId writes). */
export function getRep(id: string): Rep | null {
  return getDb().select().from(reps).where(eq(reps.id, id)).get() ?? null;
}

/** How many leads currently point at this rep (delete guard, merge response). */
export function leadCountForRep(id: string): number {
  return (
    getDb()
      .select({ n: count(leads.id) })
      .from(leads)
      .where(eq(leads.repId, id))
      .get()?.n ?? 0
  );
}
