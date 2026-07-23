// Shared pure domain types. No runtime dependencies beyond the
// status vocabulary, re-exported so callers get one import site.

export type { FollowUpStatus, StatusColorToken } from "./status";

/** Stored rating values. null is the "Unknown" state — the default. */
export type Rating = "A" | "B" | "C";

/** Fixed touchpoint method set. Labels live in strings.ts. */
export const TOUCHPOINT_METHODS = [
  "WhatsApp",
  "Email",
  "Phone",
  "Other",
] as const;
export type TouchpointMethod = (typeof TOUCHPOINT_METHODS)[number];

/** Resolved SLA configuration. Produced by getSlaConfig — server-only. */
export interface SlaConfig {
  firstResponseHours: number;
  followUpHours: number;
  responseCap: number;
}
