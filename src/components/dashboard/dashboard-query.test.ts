// buildLeadsQuery unit tests (step 4 package b). Pure function, no DOM.
import { describe, expect, it } from "vitest";
import { previousRange } from "../../lib/dates";
import { buildLeadsQuery, type QueryState } from "./dashboard-query";

const BASE_RANGE = { from: 1_000, to: 2_000 };

function baseState(overrides: Partial<QueryState> = {}): QueryState {
  return {
    view: "all",
    rating: null,
    rep: null,
    search: "",
    range: BASE_RANGE,
    compare: false,
    sort: "createdAt",
    dir: "desc",
    page: 1,
    ...overrides,
  };
}

describe("buildLeadsQuery", () => {
  it("sets the always-present params and omits rating/rep/search/compare when unset", () => {
    const params = buildLeadsQuery(baseState());
    expect(params.get("view")).toBe("all");
    expect(params.get("from")).toBe("1000");
    expect(params.get("to")).toBe("2000");
    expect(params.get("sort")).toBe("createdAt");
    expect(params.get("dir")).toBe("desc");
    expect(params.get("page")).toBe("1");
    expect(params.has("rating")).toBe(false);
    expect(params.has("rep")).toBe(false);
    expect(params.has("search")).toBe(false);
    expect(params.has("compareFrom")).toBe(false);
    expect(params.has("compareTo")).toBe(false);
  });

  it('maps rating "unknown" to "Unknown"', () => {
    const params = buildLeadsQuery(baseState({ rating: "unknown" }));
    expect(params.get("rating")).toBe("Unknown");
  });

  it("passes A/B/C rating through unchanged", () => {
    const params = buildLeadsQuery(baseState({ rating: "A" }));
    expect(params.get("rating")).toBe("A");
  });

  it("includes rep when set", () => {
    const params = buildLeadsQuery(baseState({ rep: "Alex" }));
    expect(params.get("rep")).toBe("Alex");
  });

  it("includes a non-empty search term", () => {
    const params = buildLeadsQuery(baseState({ search: "acme" }));
    expect(params.get("search")).toBe("acme");
  });

  it("omits an empty search term", () => {
    const params = buildLeadsQuery(baseState({ search: "" }));
    expect(params.has("search")).toBe(false);
  });

  it("omits a whitespace-only search term", () => {
    const params = buildLeadsQuery(baseState({ search: "   " }));
    expect(params.has("search")).toBe(false);
  });

  it("emits compareFrom/compareTo equal to previousRange of the range when compare is on", () => {
    const from = new Date(2026, 5, 11).getTime(); // Jun 11, 2026 00:00 local
    const to = new Date(2026, 6, 11).getTime(); // Jul 11, 2026 00:00 local
    const params = buildLeadsQuery(
      baseState({ range: { from, to }, compare: true }),
    );
    const prev = previousRange({ start: new Date(from), end: new Date(to) });
    expect(params.get("compareFrom")).toBe(String(prev.start.getTime()));
    expect(params.get("compareTo")).toBe(String(prev.end.getTime()));
    expect(params.get("compareFrom")).toBe(
      String(new Date(2026, 4, 12).getTime()),
    ); // May 12, 2026
    expect(params.get("compareTo")).toBe(String(new Date(2026, 5, 11).getTime())); // Jun 11, 2026
  });

  it("omits compareFrom/compareTo when compare is off", () => {
    const params = buildLeadsQuery(baseState({ compare: false }));
    expect(params.has("compareFrom")).toBe(false);
    expect(params.has("compareTo")).toBe(false);
  });

  it("omits from/to/compareFrom/compareTo when range is null, even with compare on", () => {
    const params = buildLeadsQuery(baseState({ range: null, compare: true }));
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
    expect(params.has("compareFrom")).toBe(false);
    expect(params.has("compareTo")).toBe(false);
    // The always-present params are unaffected.
    expect(params.get("view")).toBe("all");
    expect(params.get("sort")).toBe("createdAt");
    expect(params.get("dir")).toBe("desc");
    expect(params.get("page")).toBe("1");
  });

  it("sets from/to as before when range is non-null", () => {
    const params = buildLeadsQuery(baseState());
    expect(params.get("from")).toBe("1000");
    expect(params.get("to")).toBe("2000");
  });
});
