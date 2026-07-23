// null is the default and normal rating state; every write path
// normalizes ""/"Unknown"/junk → null. One state, one storage form.
import { describe, expect, it } from "vitest";
import { normalizeRating, ratingLabel } from "./rating";

describe("normalizeRating", () => {
  it("passes canonical ratings through", () => {
    expect(normalizeRating("A")).toBe("A");
    expect(normalizeRating("B")).toBe("B");
    expect(normalizeRating("C")).toBe("C");
  });

  it("canonicalizes case and whitespace", () => {
    expect(normalizeRating("a")).toBe("A");
    expect(normalizeRating(" a ")).toBe("A");
    expect(normalizeRating("b ")).toBe("B");
    expect(normalizeRating("c")).toBe("C");
  });

  it("normalizes empty, Unknown (any case), and junk to null", () => {
    expect(normalizeRating("")).toBe(null);
    expect(normalizeRating("Unknown")).toBe(null);
    expect(normalizeRating("unknown")).toBe(null);
    expect(normalizeRating("UNKNOWN")).toBe(null);
    expect(normalizeRating("未知")).toBe(null);
    expect(normalizeRating("D")).toBe(null);
    expect(normalizeRating("AB")).toBe(null);
  });

  it("normalizes non-strings to null", () => {
    expect(normalizeRating(1)).toBe(null);
    expect(normalizeRating({})).toBe(null);
    expect(normalizeRating(undefined)).toBe(null);
    expect(normalizeRating(null)).toBe(null);
  });
});

describe("ratingLabel", () => {
  it("renders null as Unknown and ratings as themselves", () => {
    expect(ratingLabel(null)).toBe("Unknown");
    expect(ratingLabel("A")).toBe("A");
    expect(ratingLabel("B")).toBe("B");
    expect(ratingLabel("C")).toBe("C");
  });
});
