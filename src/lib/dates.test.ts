// Monday-start weeks (shared by picker presets and server KPIs), the two
// display formats, and the SLA duration format, encoded as assertions.
// Fixtures are constructed from local components and asserted via local
// getters so the suite passes under any host timezone; the DST-shape tests
// additionally rely on the America/New_York pin from vitest.config.ts
// (canary in sla.test.ts).
import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDuration,
  lastNDaysRange,
  lastWeekRange,
  previousRange,
  startOfDay,
  startOfNextDay,
  startOfWeek,
  thisMonthRange,
  thisWeekRange,
  weekRange,
} from "./dates";

const HOUR = 3_600_000;

/** Local-component tuple for readable assertions. */
function local(d: Date): [number, number, number, number, number, number, number] {
  return [
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ];
}

// 2026-01-05 is a Monday.
const MONDAY = [2026, 0, 5, 0, 0, 0, 0] as const;

describe("startOfWeek (Monday 00:00 local)", () => {
  it("resolves a mid-week date to its Monday", () => {
    // Wednesday Jan 7, 2026
    expect(local(startOfWeek(new Date(2026, 0, 7, 15, 30, 12, 345)))).toEqual([
      ...MONDAY,
    ]);
  });

  it("keeps a Sunday in the week begun the previous Monday (the classic off-by-one)", () => {
    // Sunday Jan 11, 2026 → Monday Jan 5, not Monday Jan 12
    expect(local(startOfWeek(new Date(2026, 0, 11, 8, 0)))).toEqual([
      ...MONDAY,
    ]);
  });

  it("is idempotent at Monday 00:00:00.000 exactly", () => {
    const monday = new Date(2026, 0, 5, 0, 0, 0, 0);
    expect(startOfWeek(monday).getTime()).toBe(monday.getTime());
    const derived = startOfWeek(new Date(2026, 0, 8));
    expect(startOfWeek(derived).getTime()).toBe(derived.getTime());
  });

  it("crosses month and year boundaries (early January → previous December)", () => {
    // Thursday Jan 1, 2026 → Monday Dec 29, 2025
    expect(local(startOfWeek(new Date(2026, 0, 1)))).toEqual([
      2025, 11, 29, 0, 0, 0, 0,
    ]);
    // Sunday Jan 4, 2026 → same Monday Dec 29, 2025
    expect(local(startOfWeek(new Date(2026, 0, 4, 23, 59)))).toEqual([
      2025, 11, 29, 0, 0, 0, 0,
    ]);
  });

  it("never mutates its argument", () => {
    const d = new Date(2026, 0, 7, 15, 30);
    const before = d.getTime();
    startOfWeek(d);
    weekRange(d);
    expect(d.getTime()).toBe(before);
  });
});

describe("weekRange (half-open [Mon 00:00, next Mon 00:00))", () => {
  it("the end is exclusive: an instant exactly at end belongs to the next week", () => {
    const range = weekRange(new Date(2026, 0, 7));
    expect(local(range.start)).toEqual([...MONDAY]);
    expect(local(range.end)).toEqual([2026, 0, 12, 0, 0, 0, 0]);
    expect(weekRange(range.end).start.getTime()).toBe(range.end.getTime());
  });

  it("an ordinary week spans exactly 168 hours", () => {
    const range = weekRange(new Date(2026, 0, 7));
    expect(range.end.getTime() - range.start.getTime()).toBe(168 * HOUR);
  });

  it("the spring-forward week (2026-03-08) spans 167 real hours, ending Mon 00:00 local", () => {
    const range = weekRange(new Date(2026, 2, 8, 12)); // DST Sunday itself
    expect(local(range.start)).toEqual([2026, 2, 2, 0, 0, 0, 0]);
    expect(local(range.end)).toEqual([2026, 2, 9, 0, 0, 0, 0]);
    expect(range.end.getTime() - range.start.getTime()).toBe(167 * HOUR);
  });

  it("the fall-back week (2026-11-01) spans 169 real hours", () => {
    const range = weekRange(new Date(2026, 10, 1, 12));
    expect(local(range.start)).toEqual([2026, 9, 26, 0, 0, 0, 0]);
    expect(local(range.end)).toEqual([2026, 10, 2, 0, 0, 0, 0]);
    expect(range.end.getTime() - range.start.getTime()).toBe(169 * HOUR);
  });
});

describe("thisWeekRange / lastWeekRange (Mon–Sun KPI windows)", () => {
  it("takes an explicit now — the two windows share one instant", () => {
    const now = new Date(2026, 0, 7, 9, 30);
    expect(local(thisWeekRange(now).start)).toEqual([...MONDAY]);
    expect(local(lastWeekRange(now).start)).toEqual([
      2025, 11, 29, 0, 0, 0, 0,
    ]);
    expect(local(lastWeekRange(now).end)).toEqual([...MONDAY]);
  });

  it("last week ends exactly where this week starts (the KPI seam)", () => {
    const now = new Date(2026, 0, 7, 9, 30);
    expect(lastWeekRange(now).end.getTime()).toBe(
      thisWeekRange(now).start.getTime(),
    );
  });

  it("handles a now in the week after a DST transition", () => {
    const now = new Date(2026, 2, 11, 10); // Wednesday after spring-forward
    const last = lastWeekRange(now);
    expect(local(last.start)).toEqual([2026, 2, 2, 0, 0, 0, 0]);
    expect(local(last.end)).toEqual([2026, 2, 9, 0, 0, 0, 0]);
    expect(last.end.getTime() - last.start.getTime()).toBe(167 * HOUR);
  });
});

describe("display formats (pinned en-US)", () => {
  it("formatDate: Jan 5, 2026", () => {
    expect(formatDate(new Date(2026, 0, 5, 14, 30))).toBe("Jan 5, 2026");
    expect(formatDate(new Date(2026, 11, 31))).toBe("Dec 31, 2026");
  });

  it("formatDateTime: Jan 5, 2026, 14:30 (h23, zero-padded)", () => {
    expect(formatDateTime(new Date(2026, 0, 5, 14, 30))).toBe(
      "Jan 5, 2026, 14:30",
    );
    // Midnight is 00, never 24 or 12 AM:
    expect(formatDateTime(new Date(2026, 0, 5, 0, 5))).toBe(
      "Jan 5, 2026, 00:05",
    );
    // Single-digit hour pads:
    expect(formatDateTime(new Date(2026, 0, 5, 9, 5))).toBe(
      "Jan 5, 2026, 09:05",
    );
  });
});

describe("formatDuration (SLA copy; floor throughout; approved-export shapes)", () => {
  it("walks the boundary ladder", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(3_599_999)).toBe("59m");
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(18_720_000)).toBe("5h 12m"); // worked example: 18,720,000ms = 5h 12m
    expect(formatDuration(86_399_999)).toBe("23h 59m");
    expect(formatDuration(86_400_000)).toBe("1d 0h");
    expect(formatDuration(64 * HOUR)).toBe("2d 16h"); // approved export
    expect(formatDuration(30 * 24 * HOUR)).toBe("30d 0h");
  });

  it("clamps negative input to 0m (callers pass already-signed durations)", () => {
    expect(formatDuration(-1)).toBe("0m");
    expect(formatDuration(-5 * HOUR)).toBe("0m");
  });
});

describe("startOfDay (local midnight)", () => {
  it("resolves a mid-day instant to local midnight", () => {
    expect(local(startOfDay(new Date(2026, 0, 7, 15, 30, 12, 345)))).toEqual([
      2026, 0, 7, 0, 0, 0, 0,
    ]);
  });

  it("never mutates its argument", () => {
    const d = new Date(2026, 0, 7, 15, 30);
    const before = d.getTime();
    startOfDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe("startOfNextDay (half-open bound for an inclusive day)", () => {
  it("resolves an inclusive day to the following local midnight", () => {
    // Jul 10, 2026 23:59 as an inclusive "to" day → Jul 11 00:00
    expect(local(startOfNextDay(new Date(2026, 6, 10, 23, 59)))).toEqual([
      2026, 6, 11, 0, 0, 0, 0,
    ]);
  });

  it("never mutates its argument", () => {
    const d = new Date(2026, 6, 10, 23, 59);
    const before = d.getTime();
    startOfNextDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe("lastNDaysRange (calendar-day, half-open, includes today)", () => {
  it("n=30: Jun 11 – Jul 10 inclusive (the approved export's default)", () => {
    const range = lastNDaysRange(new Date(2026, 6, 10, 12), 30);
    expect(local(range.start)).toEqual([2026, 5, 11, 0, 0, 0, 0]); // Jun 11, 2026 00:00
    expect(local(range.end)).toEqual([2026, 6, 11, 0, 0, 0, 0]); // Jul 11, 2026 00:00
  });

  it("n=7: today plus the six days before it", () => {
    const range = lastNDaysRange(new Date(2026, 0, 10, 9), 7);
    expect(local(range.start)).toEqual([2026, 0, 4, 0, 0, 0, 0]); // Jan 4, 2026 00:00
    expect(local(range.end)).toEqual([2026, 0, 11, 0, 0, 0, 0]); // Jan 11, 2026 00:00
  });
});

describe("thisMonthRange (half-open [1st 00:00, next month's 1st 00:00))", () => {
  it("mid-month resolves to the enclosing calendar month", () => {
    const range = thisMonthRange(new Date(2026, 6, 15, 10));
    expect(local(range.start)).toEqual([2026, 6, 1, 0, 0, 0, 0]); // Jul 1, 2026
    expect(local(range.end)).toEqual([2026, 7, 1, 0, 0, 0, 0]); // Aug 1, 2026
  });

  it("December rolls the end into January of the next year", () => {
    const range = thisMonthRange(new Date(2026, 11, 15));
    expect(local(range.start)).toEqual([2026, 11, 1, 0, 0, 0, 0]); // Dec 1, 2026
    expect(local(range.end)).toEqual([2027, 0, 1, 0, 0, 0, 0]); // Jan 1, 2027
  });
});

describe("previousRange (equal-length window immediately before, calendar-day shifted)", () => {
  it("prev of [Jun 11, Jul 11) is [May 12, Jun 11) — the approved export's compare check", () => {
    const range = { start: new Date(2026, 5, 11), end: new Date(2026, 6, 11) };
    const prev = previousRange(range);
    expect(local(prev.start)).toEqual([2026, 4, 12, 0, 0, 0, 0]); // May 12, 2026
    expect(local(prev.end)).toEqual([2026, 5, 11, 0, 0, 0, 0]); // Jun 11, 2026
    expect(prev.end.getTime()).toBe(range.start.getTime()); // seamless with the original window
  });

  it("keeps the right calendar days across a DST-shortened week", () => {
    // The spring-forward week (2026-03-08) spans only 167 real hours, but its
    // calendar length is still 7 days — rounding must land there, not 6.
    const range = weekRange(new Date(2026, 2, 8, 12));
    const prev = previousRange(range);
    expect(local(prev.start)).toEqual([2026, 1, 23, 0, 0, 0, 0]); // Feb 23, 2026
    expect(local(prev.end)).toEqual([2026, 2, 2, 0, 0, 0, 0]); // Mar 2, 2026
    expect(prev.end.getTime()).toBe(range.start.getTime());
  });
});

describe("formatDateShort (pinned en-US, no year)", () => {
  it("formats short-form dates", () => {
    expect(formatDateShort(new Date(2026, 5, 11))).toBe("Jun 11");
    expect(formatDateShort(new Date(2026, 11, 31))).toBe("Dec 31");
  });
});
