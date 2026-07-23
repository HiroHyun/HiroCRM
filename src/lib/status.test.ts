// Exactly six statuses; active derives as the complement of terminal;
// one module owns { value, label, colorToken, isTerminal }.
import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  FOLLOW_UP_STATUSES,
  STATUSES,
  TERMINAL_STATUSES,
  canonicalizeStatus,
  isFollowUpStatus,
  isTerminalStatus,
} from "./status";

describe("status vocabulary", () => {
  it("lists exactly the six statuses, in canonical order", () => {
    expect(FOLLOW_UP_STATUSES).toEqual([
      "Pending",
      "In Communication",
      "Quoted",
      "Closed Won",
      "Lost",
      "Archived",
    ]);
  });

  it("derives the active set as the exact complement of the terminal set", () => {
    expect(ACTIVE_STATUSES).toEqual(["Pending", "In Communication", "Quoted"]);
    expect(TERMINAL_STATUSES).toEqual(["Closed Won", "Lost", "Archived"]);
    for (const s of FOLLOW_UP_STATUSES) {
      expect(ACTIVE_STATUSES.includes(s)).toBe(!TERMINAL_STATUSES.includes(s));
    }
    expect(ACTIVE_STATUSES.length + TERMINAL_STATUSES.length).toBe(
      FOLLOW_UP_STATUSES.length,
    );
  });

  it("flags terminality per status", () => {
    expect(isTerminalStatus("Pending")).toBe(false);
    expect(isTerminalStatus("In Communication")).toBe(false);
    expect(isTerminalStatus("Quoted")).toBe(false);
    expect(isTerminalStatus("Closed Won")).toBe(true);
    expect(isTerminalStatus("Lost")).toBe(true);
    expect(isTerminalStatus("Archived")).toBe(true);
  });

  it("maps each status to its signal token", () => {
    const tokens = Object.fromEntries(
      STATUSES.map((s) => [s.value, s.colorToken]),
    );
    expect(tokens).toEqual({
      Pending: "warn",
      "In Communication": "info",
      Quoted: "success",
      "Closed Won": "success",
      Lost: "danger",
      Archived: "muted",
    });
  });

  it("labels render as the stored values (approved design export)", () => {
    for (const s of STATUSES) {
      expect(s.label).toBe(s.value);
    }
  });
});

describe("isFollowUpStatus", () => {
  it("accepts exactly the six statuses", () => {
    for (const s of FOLLOW_UP_STATUSES) {
      expect(isFollowUpStatus(s)).toBe(true);
    }
  });

  it("rejects casing variants, junk, and non-strings", () => {
    expect(isFollowUpStatus("pending")).toBe(false);
    expect(isFollowUpStatus("Closed won")).toBe(false);
    expect(isFollowUpStatus("")).toBe(false);
    expect(isFollowUpStatus("Won")).toBe(false);
    expect(isFollowUpStatus(42)).toBe(false);
    expect(isFollowUpStatus(null)).toBe(false);
    expect(isFollowUpStatus(undefined)).toBe(false);
  });
});

describe("canonicalizeStatus (import path)", () => {
  it("canonicalizes case-insensitively with trimming", () => {
    expect(canonicalizeStatus("closed won")).toBe("Closed Won");
    expect(canonicalizeStatus(" PENDING ")).toBe("Pending");
    expect(canonicalizeStatus("in communication")).toBe("In Communication");
    expect(canonicalizeStatus("Archived")).toBe("Archived");
  });

  it("returns null for junk and non-strings", () => {
    expect(canonicalizeStatus("Won")).toBe(null);
    expect(canonicalizeStatus("")).toBe(null);
    expect(canonicalizeStatus("已报价")).toBe(null);
    expect(canonicalizeStatus(42)).toBe(null);
    expect(canonicalizeStatus(null)).toBe(null);
    expect(canonicalizeStatus(undefined)).toBe(null);
  });
});
