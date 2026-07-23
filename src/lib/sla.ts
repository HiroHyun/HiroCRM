// The one module that owns SLA deadline math and state predicates. All
// arithmetic is on epoch milliseconds — no Date appears in any signature,
// so wall-clock math is unrepresentable here by construction.
// Drizzle returns Date objects for timestamp_ms columns; callers convert at
// the boundary with .getTime().

import { isTerminalStatus, type FollowUpStatus } from "./status";
import type { SlaConfig } from "./types";

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  firstResponseHours: 72,
  followUpHours: 120,
  responseCap: 3,
};

const HOUR_MS = 3_600_000;

// 12h threshold — the "due soon" boundary shared by the SLA cell
// shading and the KPI due-soon count.
export const DUE_SOON_MS = 12 * 60 * 60 * 1000;

/**
 * Resolve SLA config from environment variables.
 *
 * Server-only: call it with process.env on the server. Browser bundles carry
 * no SLA_* vars, so client code must never call this — the resolved config
 * travels to the client inside API payloads instead. Each variable falls back
 * to its default independently when missing or invalid: hours accept any
 * finite value > 0 (fractions allowed), the cap requires an integer >= 1.
 */
export function getSlaConfig(env: Record<string, string | undefined>): SlaConfig {
  return {
    firstResponseHours:
      parseHours(env.SLA_FIRST_RESPONSE_HOURS) ??
      DEFAULT_SLA_CONFIG.firstResponseHours,
    followUpHours:
      parseHours(env.SLA_FOLLOW_UP_HOURS) ?? DEFAULT_SLA_CONFIG.followUpHours,
    responseCap:
      parseCap(env.SLA_RESPONSE_CAP) ?? DEFAULT_SLA_CONFIG.responseCap,
  };
}

function parseHours(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseCap(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim());
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * Lead timing facts, all epoch ms. lastTouchpointAt is required — null means
 * "no touchpoints yet"; a caller holding a count but no timestamp must be a
 * compile error, never a silent 72h window.
 */
export interface SlaInput {
  createdAt: number;
  touchpointCount: number;
  lastTouchpointAt: number | null;
}

/**
 * The running deadline (epoch ms), or null when the clock is stopped because
 * follow-up is complete (touchpointCount >= responseCap).
 */
export function slaDeadline(input: SlaInput, config: SlaConfig): number | null {
  const { createdAt, touchpointCount, lastTouchpointAt } = input;
  // Corrupt input fails loud — even when the deadline wouldn't need the
  // timestamp (n >= cap), a count without a timestamp is never trusted.
  if (touchpointCount > 0 && lastTouchpointAt === null) {
    throw new Error(
      `SLA: lead has ${touchpointCount} touchpoint(s) but no last-touchpoint timestamp`,
    );
  }
  if (touchpointCount >= config.responseCap) return null;
  if (touchpointCount === 0 || lastTouchpointAt === null) {
    return createdAt + config.firstResponseHours * HOUR_MS;
  }
  return lastTouchpointAt + config.followUpHours * HOUR_MS;
}

export type SlaState =
  | { kind: "terminal" }
  | { kind: "complete" }
  | { kind: "due"; deadline: number; msRemaining: number }
  | { kind: "overdue"; deadline: number; msOverdue: number };

export interface SlaStateInput extends SlaInput {
  status: FollowUpStatus;
}

/**
 * Full SLA state for a lead at `now` (epoch ms). Terminal status stops the
 * clock at any point and is checked first. Boundary convention:
 * the exact deadline instant is still "due" (msRemaining 0); breach starts
 * one ms past it.
 */
export function getSlaState(
  input: SlaStateInput,
  now: number,
  config: SlaConfig,
): SlaState {
  if (isTerminalStatus(input.status)) return { kind: "terminal" };
  const deadline = slaDeadline(input, config);
  if (deadline === null) return { kind: "complete" };
  return now > deadline
    ? { kind: "overdue", deadline, msOverdue: now - deadline }
    : { kind: "due", deadline, msRemaining: deadline - now };
}

/** The overdue-KPI / Overdue-view predicate. */
export function isBreached(
  input: SlaStateInput,
  now: number,
  config: SlaConfig,
): boolean {
  return getSlaState(input, now, config).kind === "overdue";
}
