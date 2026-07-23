import { describe, expect, it } from "vitest";
import { importReasonLabel } from "./import-reasons";
import { strings } from "./strings";

const ROUTE_CODES = [
  "missing_contact",
  "missing_rep",
  "invalid_contact",
  "invalid_status",
  "unrecognized_date",
  "row_failed",
] as const;

describe("importReasonLabel", () => {
  it("maps every route code to a distinct, non-empty label that isn't the unknown fallback", () => {
    for (const code of ROUTE_CODES) {
      const label = importReasonLabel(code);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(strings.importReasons.unknown);
    }
  });

  it("falls back to the unknown label for an unrecognized code", () => {
    expect(importReasonLabel("totally_unknown")).toBe(
      strings.importReasons.unknown,
    );
  });
});
