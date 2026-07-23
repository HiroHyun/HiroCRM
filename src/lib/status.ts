// The one module that owns the status vocabulary: value, label,
// colorToken, isTerminal per status. Every badge, filter, select, and
// validator derives from here — nothing re-enumerates statuses.

import { strings } from "./strings";

/** Semantic signal tokens for status color coding across the UI. */
export type StatusColorToken = "success" | "warn" | "danger" | "info" | "muted";

const STATUS_DEFS = [
  { value: "Pending", colorToken: "warn", isTerminal: false },
  { value: "In Communication", colorToken: "info", isTerminal: false },
  { value: "Quoted", colorToken: "success", isTerminal: false },
  { value: "Closed Won", colorToken: "success", isTerminal: true },
  { value: "Lost", colorToken: "danger", isTerminal: true },
  { value: "Archived", colorToken: "muted", isTerminal: true },
] as const satisfies readonly {
  value: keyof typeof strings.status; // a status without a label is a compile error
  colorToken: StatusColorToken;
  isTerminal: boolean;
}[];

export type FollowUpStatus = (typeof STATUS_DEFS)[number]["value"];

export interface StatusDef {
  value: FollowUpStatus;
  label: string;
  colorToken: StatusColorToken;
  isTerminal: boolean;
}

/** All six statuses, in canonical order — drives select/filter render order. */
export const STATUSES: readonly StatusDef[] = STATUS_DEFS.map((def) => ({
  ...def,
  label: strings.status[def.value],
}));

export const FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = STATUSES.map(
  (s) => s.value,
);

export const TERMINAL_STATUSES: readonly FollowUpStatus[] = STATUSES.filter(
  (s) => s.isTerminal,
).map((s) => s.value);

/** Active is the complement of terminal — never a second hand-kept list. */
export const ACTIVE_STATUSES: readonly FollowUpStatus[] =
  FOLLOW_UP_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s));

/** Write-path validator: anything not in the six-value set is a 400. */
export function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return (
    typeof value === "string" &&
    (FOLLOW_UP_STATUSES as readonly string[]).includes(value)
  );
}

export function isTerminalStatus(status: FollowUpStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Import-path canonicalization: trim + case-insensitive match into
 * the six-value set; anything else is null (the row fails validation).
 */
export function canonicalizeStatus(input: unknown): FollowUpStatus | null {
  if (typeof input !== "string") return null;
  const needle = input.trim().toLowerCase();
  return FOLLOW_UP_STATUSES.find((s) => s.toLowerCase() === needle) ?? null;
}
