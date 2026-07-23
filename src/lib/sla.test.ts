// SLA deadline & state rules encoded as assertions: windows for n=0/1/2,
// cap behavior, terminal precedence, epoch-vs-DST, env-configurable
// constants. Each of these edge cases was a production bug once — these
// tests are the regression lock.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLA_CONFIG,
  getSlaConfig,
  getSlaState,
  isBreached,
  slaDeadline,
} from "./sla";
import { TERMINAL_STATUSES } from "./status";

const HOUR = 3_600_000;
const CFG = DEFAULT_SLA_CONFIG; // 72h first response / 120h follow-up / cap 3

// Arbitrary fixed anchor (epoch ms) — SLA math is pure epoch arithmetic.
const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);

describe("timezone canary", () => {
  it("runs under a DST-observing zone (America/New_York pinned in vitest config)", () => {
    // If TZ pinning ever silently fails, this fails loudly instead of the
    // DST tests below passing vacuously.
    const beforeTransition = new Date(2026, 2, 7, 12).getTimezoneOffset();
    const afterTransition = new Date(2026, 2, 9, 12).getTimezoneOffset();
    expect(beforeTransition - afterTransition).toBe(60);
  });
});

describe("slaDeadline (SLA windows)", () => {
  it("n = 0: createdAt + FIRST_RESPONSE_HOURS", () => {
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 0, lastTouchpointAt: null },
        CFG,
      ),
    ).toBe(T0 + 72 * HOUR);
  });

  it("n = 1 and n = 2: lastTouchpoint + FOLLOW_UP_HOURS", () => {
    const t1 = T0 + 5 * HOUR;
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 1, lastTouchpointAt: t1 },
        CFG,
      ),
    ).toBe(t1 + 120 * HOUR);
    const t2 = T0 + 30 * HOUR;
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 2, lastTouchpointAt: t2 },
        CFG,
      ),
    ).toBe(t2 + 120 * HOUR);
  });

  it("n >= cap: clock stops (null), including counts beyond the cap (legacy data)", () => {
    const t = T0 + 50 * HOUR;
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 3, lastTouchpointAt: t },
        CFG,
      ),
    ).toBe(null);
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 5, lastTouchpointAt: t },
        CFG,
      ),
    ).toBe(null);
  });

  it("generalizes to configured caps (cap 2, and degenerate cap 1)", () => {
    const cap2 = { ...CFG, responseCap: 2 };
    const t1 = T0 + HOUR;
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 1, lastTouchpointAt: t1 },
        cap2,
      ),
    ).toBe(t1 + 120 * HOUR);
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 2, lastTouchpointAt: t1 },
        cap2,
      ),
    ).toBe(null);

    const cap1 = { ...CFG, responseCap: 1 };
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 0, lastTouchpointAt: null },
        cap1,
      ),
    ).toBe(T0 + 72 * HOUR);
    // The follow-up branch is unreachable under cap 1: n = 1 is already complete.
    expect(
      slaDeadline(
        { createdAt: T0, touchpointCount: 1, lastTouchpointAt: t1 },
        cap1,
      ),
    ).toBe(null);
  });

  it("throws on a touchpoint count without a timestamp — never a silent window", () => {
    expect(() =>
      slaDeadline(
        { createdAt: T0, touchpointCount: 1, lastTouchpointAt: null },
        CFG,
      ),
    ).toThrow();
    // Strict reading: corrupt input fails loud even when the deadline
    // wouldn't need the timestamp (n >= cap).
    expect(() =>
      slaDeadline(
        { createdAt: T0, touchpointCount: 5, lastTouchpointAt: null },
        CFG,
      ),
    ).toThrow();
  });

  it("uses epoch math across DST (2026-03-08 America/New_York spring-forward)", () => {
    // 12:00 EST the day before the transition.
    const createdAt = new Date(2026, 2, 7, 12, 0, 0, 0).getTime();
    const deadline = slaDeadline(
      { createdAt, touchpointCount: 0, lastTouchpointAt: null },
      CFG,
    );
    // Exactly 72h of real elapsed time…
    expect(deadline).toBe(createdAt + 72 * HOUR);
    // …which lands at 13:00 local EDT (wall-clock +72h would say 12:00 —
    // hand-computed absolute fixture, not just the tautological difference).
    expect(deadline).toBe(new Date(2026, 2, 10, 13, 0, 0, 0).getTime());
  });
});

describe("getSlaState", () => {
  const active = "Pending" as const;

  it("terminal status stops the clock at any point — over complete and over overdue", () => {
    for (const status of TERMINAL_STATUSES) {
      // Would be "complete" if the status were active:
      expect(
        getSlaState(
          { status, createdAt: T0, touchpointCount: 3, lastTouchpointAt: T0 },
          T0 + 1000 * HOUR,
          CFG,
        ),
      ).toEqual({ kind: "terminal" });
      // Would be deeply "overdue" if the status were active:
      expect(
        getSlaState(
          { status, createdAt: T0, touchpointCount: 0, lastTouchpointAt: null },
          T0 + 1000 * HOUR,
          CFG,
        ),
      ).toEqual({ kind: "terminal" });
      // Terminal even wins over the corrupt-input throw (count without
      // timestamp) — the clock is stopped before deadline math runs, so
      // legacy terminal rows can never crash a list render.
      expect(
        getSlaState(
          { status, createdAt: T0, touchpointCount: 1, lastTouchpointAt: null },
          T0,
          CFG,
        ),
      ).toEqual({ kind: "terminal" });
    }
  });

  it("n >= cap on an active lead is complete and never breached, however old", () => {
    const state = getSlaState(
      { status: active, createdAt: T0, touchpointCount: 5, lastTouchpointAt: T0 },
      T0 + 1000 * HOUR,
      CFG,
    );
    expect(state).toEqual({ kind: "complete" });
    expect(
      isBreached(
        { status: active, createdAt: T0, touchpointCount: 5, lastTouchpointAt: T0 },
        T0 + 1000 * HOUR,
        CFG,
      ),
    ).toBe(false);
  });

  it("the exact deadline instant is due (msRemaining 0); one ms later is overdue", () => {
    // First-response window (n = 0):
    const d0 = T0 + 72 * HOUR;
    const input0 = {
      status: active,
      createdAt: T0,
      touchpointCount: 0,
      lastTouchpointAt: null,
    };
    expect(getSlaState(input0, d0, CFG)).toEqual({
      kind: "due",
      deadline: d0,
      msRemaining: 0,
    });
    expect(isBreached(input0, d0, CFG)).toBe(false);
    expect(getSlaState(input0, d0 + 1, CFG)).toEqual({
      kind: "overdue",
      deadline: d0,
      msOverdue: 1,
    });
    expect(isBreached(input0, d0 + 1, CFG)).toBe(true);

    // Follow-up window (n = 1):
    const t1 = T0 + 10 * HOUR;
    const d1 = t1 + 120 * HOUR;
    const input1 = {
      status: active,
      createdAt: T0,
      touchpointCount: 1,
      lastTouchpointAt: t1,
    };
    expect(getSlaState(input1, d1, CFG)).toEqual({
      kind: "due",
      deadline: d1,
      msRemaining: 0,
    });
    expect(isBreached(input1, d1, CFG)).toBe(false);
    expect(getSlaState(input1, d1 + 1, CFG)).toEqual({
      kind: "overdue",
      deadline: d1,
      msOverdue: 1,
    });
    expect(isBreached(input1, d1 + 1, CFG)).toBe(true);
  });

  it("reports remaining/overdue durations for the UI", () => {
    const d0 = T0 + 72 * HOUR;
    expect(
      getSlaState(
        { status: active, createdAt: T0, touchpointCount: 0, lastTouchpointAt: null },
        d0 - 5 * HOUR,
        CFG,
      ),
    ).toEqual({ kind: "due", deadline: d0, msRemaining: 5 * HOUR });
    expect(
      getSlaState(
        { status: active, createdAt: T0, touchpointCount: 0, lastTouchpointAt: null },
        d0 + 3 * HOUR,
        CFG,
      ),
    ).toEqual({ kind: "overdue", deadline: d0, msOverdue: 3 * HOUR });
  });
});

describe("getSlaConfig (env-configurable)", () => {
  it("returns exactly the defaults for an empty env", () => {
    expect(getSlaConfig({})).toEqual({
      firstResponseHours: 72,
      followUpHours: 120,
      responseCap: 3,
    });
  });

  it("reads valid values, trimming whitespace", () => {
    expect(
      getSlaConfig({
        SLA_FIRST_RESPONSE_HOURS: " 48 ",
        SLA_FOLLOW_UP_HOURS: "96",
        SLA_RESPONSE_CAP: "5",
      }),
    ).toEqual({ firstResponseHours: 48, followUpHours: 96, responseCap: 5 });
  });

  it("allows fractional hours but requires an integer cap >= 1", () => {
    expect(getSlaConfig({ SLA_FIRST_RESPONSE_HOURS: "1.5" })).toEqual({
      ...DEFAULT_SLA_CONFIG,
      firstResponseHours: 1.5,
    });
    expect(getSlaConfig({ SLA_FOLLOW_UP_HOURS: "1.5" })).toEqual({
      ...DEFAULT_SLA_CONFIG,
      followUpHours: 1.5,
    });
    expect(getSlaConfig({ SLA_RESPONSE_CAP: "1.5" })).toEqual(
      DEFAULT_SLA_CONFIG,
    );
    expect(getSlaConfig({ SLA_RESPONSE_CAP: "0" })).toEqual(DEFAULT_SLA_CONFIG);
    expect(getSlaConfig({ SLA_RESPONSE_CAP: "1" })).toEqual({
      ...DEFAULT_SLA_CONFIG,
      responseCap: 1,
    });
  });

  it("falls back per variable, independently — junk in one never resets the others", () => {
    expect(
      getSlaConfig({
        SLA_FIRST_RESPONSE_HOURS: "abc",
        SLA_FOLLOW_UP_HOURS: "96",
        SLA_RESPONSE_CAP: "2",
      }),
    ).toEqual({ firstResponseHours: 72, followUpHours: 96, responseCap: 2 });
  });

  it.each(["", "abc", "0", "-1", "Infinity"])(
    "treats %j as junk for every variable",
    (junk) => {
      expect(
        getSlaConfig({
          SLA_FIRST_RESPONSE_HOURS: junk,
          SLA_FOLLOW_UP_HOURS: junk,
          SLA_RESPONSE_CAP: junk,
        }),
      ).toEqual(DEFAULT_SLA_CONFIG);
    },
  );

  it("never mutates the injected env or process.env", () => {
    const env = { SLA_RESPONSE_CAP: "9" };
    const before = process.env.SLA_RESPONSE_CAP;
    getSlaConfig(env);
    expect(env).toEqual({ SLA_RESPONSE_CAP: "9" });
    expect(process.env.SLA_RESPONSE_CAP).toBe(before);
  });
});
