// Pure query-string builder for GET /api/leads. No
// "use client" — this module is imported by the state owner and exercised
// directly by vitest; it never touches the DOM.

import type { LeadSort, LeadView, SortDir } from "../../server/lead-query";
import type { Rating } from "../../lib/types";
import { previousRange } from "../../lib/dates";

/** Half-open [from, to) window over createdAt, epoch ms (mirrors DateWindow's convention). */
export interface DateRangeMs {
  from: number;
  to: number;
}

export type RatingFilter = Rating | "unknown" | null;

export interface QueryState {
  view: LeadView;
  rating: RatingFilter;
  rep: string | null;
  search: string;
  /** null means no date window at all — an unbounded "All time" range. */
  range: DateRangeMs | null;
  compare: boolean;
  sort: LeadSort;
  dir: SortDir;
  page: number;
}

/** Builds the GET /api/leads query string from dashboard state. */
export function buildLeadsQuery(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (state.range !== null) {
    params.set("from", String(state.range.from));
    params.set("to", String(state.range.to));
  }
  params.set("sort", state.sort);
  params.set("dir", state.dir);
  params.set("page", String(state.page));

  if (state.rating === "unknown") {
    params.set("rating", "Unknown");
  } else if (state.rating !== null) {
    params.set("rating", state.rating);
  }

  if (state.rep !== null) params.set("rep", state.rep);

  if (state.search.trim() !== "") params.set("search", state.search);

  // An unbounded range has no previous period to compare against.
  if (state.compare && state.range !== null) {
    const prev = previousRange({
      start: new Date(state.range.from),
      end: new Date(state.range.to),
    });
    params.set("compareFrom", String(prev.start.getTime()));
    params.set("compareTo", String(prev.end.getTime()));
  }

  return params;
}
