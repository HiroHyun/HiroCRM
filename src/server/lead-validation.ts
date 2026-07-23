// The one write-validation module: POST, PATCH, and import all
// funnel through here, so a rule that exists on one write path exists on all
// of them — status whitelist, rating normalization, screenshot shape,
// contactKey computation, duplicate handling, archivedAt bookkeeping.

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import { leads, type Lead } from "../db/schema";
import { normalizeContactKey } from "../lib/contact";
import { normalizeRating } from "../lib/rating";
import {
  isFollowUpStatus,
  isTerminalStatus,
  type FollowUpStatus,
} from "../lib/status";
import type { Rating } from "../lib/types";
import { isStoredUploadName } from "./uploads";

/** A fully validated lead write, ready to become a fresh insert literal. */
export interface ParsedLeadWrite {
  contactInfo: string;
  contactKey: string;
  country: string;
  repId: string;
  interest: string;
  note: string;
  screenshotUrls: string[];
  followUpStatus: FollowUpStatus;
  rating: Rating | null;
}

export type ParseCreateResult =
  | { ok: true; lead: ParsedLeadWrite }
  | { ok: false; error: string };

export type ParsePatchResult =
  | { ok: true; patch: Partial<ParsedLeadWrite> }
  | { ok: false; error: string };

/**
 * Field length/count ceilings (characters / entries). Generous for real use,
 * hard walls against pathological payloads growing SQLite rows, API
 * responses, and browser memory. Import cells share these via the import
 * route; touchpoint notes share via the touchpoints route.
 */
export const FIELD_LIMITS = {
  contactInfo: 500,
  country: 100,
  interest: 500,
  note: 5000,
  repName: 100,
  touchpointNotes: 2000,
  screenshotsPerLead: 20,
} as const;

/** Required free-text field: non-blank string within `max` (stored raw). */
function parseRequiredString(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.length <= max ? value : null;
}

/** Optional free-text field: absent/null → ""; non-string or over `max` → error. */
function parseOptionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  return value.length <= max ? value : null;
}

function parseScreenshotUrls(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > FIELD_LIMITS.screenshotsPerLead) return null;
  const urls: string[] = [];
  for (const entry of value) {
    // Shape, not provenance (seed data isn't uuid-named): /uploads/ + one
    // safe path segment with an allowlisted extension.
    if (typeof entry !== "string" || !entry.startsWith("/uploads/")) {
      return null;
    }
    if (!isStoredUploadName(entry.slice("/uploads/".length))) return null;
    urls.push(entry);
  }
  return urls;
}

export function parseLeadCreate(body: Record<string, unknown>): ParseCreateResult {
  const contactInfo = parseRequiredString(body.contactInfo, FIELD_LIMITS.contactInfo);
  if (contactInfo === null) return { ok: false, error: "missing_contact" };

  const repId = parseRequiredString(body.repId, FIELD_LIMITS.repName);
  if (repId === null) return { ok: false, error: "missing_rep" };

  const country = parseOptionalString(body.country, FIELD_LIMITS.country);
  if (country === null) return { ok: false, error: "invalid_country" };
  const interest = parseOptionalString(body.interest, FIELD_LIMITS.interest);
  if (interest === null) return { ok: false, error: "invalid_interest" };
  const note = parseOptionalString(body.note, FIELD_LIMITS.note);
  if (note === null) return { ok: false, error: "invalid_note" };

  const status = body.followUpStatus === undefined ? "Pending" : body.followUpStatus;
  if (!isFollowUpStatus(status)) return { ok: false, error: "invalid_status" };

  const screenshotUrls = parseScreenshotUrls(body.screenshotUrls);
  if (screenshotUrls === null) return { ok: false, error: "invalid_screenshots" };

  const contactKey = normalizeContactKey(contactInfo);
  if (contactKey === null) return { ok: false, error: "invalid_contact" };

  return {
    ok: true,
    lead: {
      contactInfo,
      contactKey,
      country,
      repId,
      interest,
      note,
      screenshotUrls,
      followUpStatus: status,
      rating: normalizeRating(body.rating), // junk → null, never a 400
    },
  };
}

/**
 * PATCH: validate exactly the present mutable fields; everything else in the
 * body is ignored. id/createdAt/contactKey/archivedAt are never
 * client-writable — contactKey is recomputed when contactInfo changes and
 * archivedAt moves only through archivedAtTransition.
 */
export function parseLeadPatch(body: Record<string, unknown>): ParsePatchResult {
  const patch: Partial<ParsedLeadWrite> = {};

  if ("contactInfo" in body) {
    const contactInfo = parseRequiredString(body.contactInfo, FIELD_LIMITS.contactInfo);
    if (contactInfo === null) return { ok: false, error: "missing_contact" };
    const contactKey = normalizeContactKey(contactInfo);
    if (contactKey === null) return { ok: false, error: "invalid_contact" };
    patch.contactInfo = contactInfo;
    patch.contactKey = contactKey;
  }
  if ("repId" in body) {
    const repId = parseRequiredString(body.repId, FIELD_LIMITS.repName);
    if (repId === null) return { ok: false, error: "missing_rep" };
    patch.repId = repId;
  }
  if ("country" in body) {
    const country = parseOptionalString(body.country, FIELD_LIMITS.country);
    if (country === null) return { ok: false, error: "invalid_country" };
    patch.country = country;
  }
  if ("interest" in body) {
    const interest = parseOptionalString(body.interest, FIELD_LIMITS.interest);
    if (interest === null) return { ok: false, error: "invalid_interest" };
    patch.interest = interest;
  }
  if ("note" in body) {
    const note = parseOptionalString(body.note, FIELD_LIMITS.note);
    if (note === null) return { ok: false, error: "invalid_note" };
    patch.note = note;
  }
  if ("followUpStatus" in body) {
    if (!isFollowUpStatus(body.followUpStatus)) {
      return { ok: false, error: "invalid_status" };
    }
    patch.followUpStatus = body.followUpStatus;
  }
  if ("rating" in body) {
    patch.rating = normalizeRating(body.rating);
  }
  if ("screenshotUrls" in body) {
    const screenshotUrls = parseScreenshotUrls(body.screenshotUrls);
    if (screenshotUrls === null) {
      return { ok: false, error: "invalid_screenshots" };
    }
    patch.screenshotUrls = screenshotUrls;
  }

  return { ok: true, patch };
}

/**
 * The one archivedAt bookkeeping helper. Returns the field to
 * spread into a write: active→terminal stamps `at`, terminal→active clears,
 * terminal at birth (oldStatus null) stamps, terminal→terminal preserves the
 * existing stamp (re-stamping would silently reset the retention clock).
 */
export function archivedAtTransition(
  oldStatus: FollowUpStatus | null,
  newStatus: FollowUpStatus,
  at: Date,
): { archivedAt?: Date | null } {
  const wasTerminal = oldStatus !== null && isTerminalStatus(oldStatus);
  const nowTerminal = isTerminalStatus(newStatus);
  if (!wasTerminal && nowTerminal) return { archivedAt: at };
  if (wasTerminal && !nowTerminal) return { archivedAt: null };
  return {};
}

/** Existing lead holding this contactKey (dedup). PATCH excludes self. */
export function findDuplicateId(
  contactKey: string,
  excludeId?: string,
): string | null {
  const row = getDb()
    .select({ id: leads.id })
    .from(leads)
    .where(
      excludeId === undefined
        ? eq(leads.contactKey, contactKey)
        : and(eq(leads.contactKey, contactKey), ne(leads.id, excludeId)),
    )
    .get();
  return row?.id ?? null;
}

/**
 * The unique-index race backstop. drizzle 0.45's better-sqlite3 driver
 * surfaces the raw SqliteError (no DrizzleQueryError wrapper), so match by
 * code, not instanceof.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export type InsertLeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; duplicateId: string | null };

/**
 * Shared insert for POST and import: duplicate pre-check (friendly path) +
 * unique-constraint catch (race backstop), fresh literal typed against the
 * schema. `createdAt` non-null only on import rows with a Created At column;
 * a terminal-at-birth row stamps archivedAt at that same instant.
 */
export function insertLead(
  parsed: ParsedLeadWrite,
  createdAt: Date | null,
): InsertLeadResult {
  const existing = findDuplicateId(parsed.contactKey);
  if (existing !== null) return { ok: false, duplicateId: existing };

  const stampAt = createdAt ?? new Date();
  const values: typeof leads.$inferInsert = {
    contactInfo: parsed.contactInfo,
    contactKey: parsed.contactKey,
    country: parsed.country,
    repId: parsed.repId,
    interest: parsed.interest,
    note: parsed.note,
    screenshotUrls: parsed.screenshotUrls,
    followUpStatus: parsed.followUpStatus,
    rating: parsed.rating,
    ...archivedAtTransition(null, parsed.followUpStatus, stampAt),
  };
  if (createdAt !== null) values.createdAt = createdAt;

  try {
    const lead = getDb().insert(leads).values(values).returning().get();
    return { ok: true, lead };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, duplicateId: findDuplicateId(parsed.contactKey) };
    }
    throw err;
  }
}
