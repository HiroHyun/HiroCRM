// The one lead list/KPI query module: the list query, every KPI
// count, the compare count, and the rep dropdown all build their WHERE
// through one shared builder — only the date window differs per caller.
// Breach state comes from src/lib/sla.ts, never re-derived. DB-level
// sort+pagination for plain fields; in-memory only where SLA math requires
// it.

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "../db";
import { leads, reps, touchpoints, type Lead } from "../db/schema";
import { PAGE_SIZE, type LeadsListResponse } from "../lib/api-types";
import { lastWeekRange, thisWeekRange } from "../lib/dates";
import { DUE_SOON_MS, getSlaConfig, getSlaState, type SlaState } from "../lib/sla";
import {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  type FollowUpStatus,
} from "../lib/status";
import type { Rating, SlaConfig } from "../lib/types";
import { toLeadRowWire } from "./serialize";

export type LeadView = "all" | "active" | "overdue" | "closed";
export type LeadSort = "createdAt" | "country" | "repName" | "rating" | "sla";
export type SortDir = "asc" | "desc";

export interface LeadFilters {
  view: LeadView;
  /** "unknown" filters rating IS NULL exactly; null = no filter. */
  rating: Rating | "unknown" | null;
  rep: string | null;
  search: string | null;
}

/** Half-open [from, to) window over createdAt, epoch ms. */
export interface DateWindow {
  from: number | null;
  to: number | null;
}

export interface LeadListQuery {
  filters: LeadFilters;
  window: DateWindow;
  compareWindow: DateWindow | null;
  sort: LeadSort;
  dir: SortDir;
  page: number;
}

const VIEWS: readonly LeadView[] = ["all", "active", "overdue", "closed"];
const SORTS: readonly LeadSort[] = [
  "createdAt",
  "country",
  "repName",
  "rating",
  "sla",
];

function parseEpochMs(value: string | null): number | null {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** Defensive query parsing: junk degrades to safe defaults, never 500s. */
export function parseLeadListQuery(params: URLSearchParams): LeadListQuery {
  const viewRaw = params.get("view");
  const view = (VIEWS as readonly string[]).includes(viewRaw ?? "")
    ? (viewRaw as LeadView)
    : "all";

  const ratingRaw = params.get("rating");
  const rating: LeadFilters["rating"] =
    ratingRaw === "A" || ratingRaw === "B" || ratingRaw === "C"
      ? ratingRaw
      : ratingRaw === "Unknown"
        ? "unknown"
        : null;

  const repRaw = params.get("rep");
  const searchRaw = params.get("search");

  const sortRaw = params.get("sort");
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as LeadSort)
    : "createdAt";
  const dir: SortDir = params.get("dir") === "asc" ? "asc" : "desc";

  const pageRaw = params.get("page");
  const page =
    pageRaw !== null && /^\d+$/.test(pageRaw) && Number(pageRaw) >= 1
      ? Number(pageRaw)
      : 1;

  const compareFrom = parseEpochMs(params.get("compareFrom"));
  const compareTo = parseEpochMs(params.get("compareTo"));

  return {
    filters: {
      view,
      rating,
      rep: repRaw !== null && repRaw !== "" ? repRaw : null,
      search: searchRaw !== null && searchRaw.trim() !== "" ? searchRaw : null,
    },
    window: {
      from: parseEpochMs(params.get("from")),
      to: parseEpochMs(params.get("to")),
    },
    compareWindow:
      compareFrom !== null || compareTo !== null
        ? { from: compareFrom, to: compareTo }
        : null,
    sort,
    dir,
    page,
  };
}

const SEARCH_COLUMNS = [
  leads.country,
  leads.contactInfo,
  leads.interest,
  reps.name,
  leads.note,
];

/**
 * The shared where-builder. View tabs restrict the status set here; the
 * active/overdue breach split happens in memory afterwards (SLA math).
 */
export function buildLeadWhere(
  filters: LeadFilters,
  window: DateWindow,
): SQL | undefined {
  const conds: (SQL | undefined)[] = [];

  if (filters.view === "closed") {
    conds.push(inArray(leads.followUpStatus, [...TERMINAL_STATUSES]));
  } else if (filters.view === "active" || filters.view === "overdue") {
    conds.push(inArray(leads.followUpStatus, [...ACTIVE_STATUSES]));
  }

  if (filters.rating === "unknown") {
    conds.push(isNull(leads.rating));
  } else if (filters.rating !== null) {
    conds.push(eq(leads.rating, filters.rating));
  }

  if (filters.rep !== null) conds.push(eq(leads.repId, filters.rep));

  if (filters.search !== null) {
    // Substring match; escape LIKE wildcards — drizzle's like()
    // has no ESCAPE clause, so the fragment is hand-written.
    const pattern = `%${filters.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(...SEARCH_COLUMNS.map((col) => sql`${col} LIKE ${pattern} ESCAPE '\\'`)),
    );
  }

  // timestamp_ms columns bind Date objects, never raw epoch numbers.
  if (window.from !== null) conds.push(gte(leads.createdAt, new Date(window.from)));
  if (window.to !== null) conds.push(lt(leads.createdAt, new Date(window.to)));

  return and(...conds);
}

interface AggRow {
  lead: Lead;
  repName: string;
  touchpointCount: number;
  lastTouchpointAt: number | null;
}

function selectLeadsWithAgg(where: SQL | undefined) {
  const db = getDb();
  // Touchpoint aggregates per lead. count(touchpoints.id), never count(*):
  // on the LEFT JOIN a zero-touchpoint lead is one row of NULLs, and
  // count(*) would report 1 — which sla.ts rejects loudly (count without
  // timestamp). Raw-sql max() keeps the epoch-ms integer, bypassing the
  // Date mapping.
  const tpAgg = db
    .select({
      leadId: touchpoints.leadId,
      count: sql<number>`count(${touchpoints.id})`.as("tp_count"),
      lastAt: sql<number | null>`max(${touchpoints.timestamp})`.as("last_tp_at"),
    })
    .from(touchpoints)
    .groupBy(touchpoints.leadId)
    .as("tp_agg");

  return db
    .select({
      lead: leads,
      repName: reps.name,
      touchpointCount: sql<number>`coalesce(${tpAgg.count}, 0)`,
      lastTouchpointAt: tpAgg.lastAt,
    })
    .from(leads)
    .innerJoin(reps, eq(reps.id, leads.repId))
    .leftJoin(tpAgg, eq(tpAgg.leadId, leads.id))
    .where(where);
}

function countLeadsWhere(where: SQL | undefined): number {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .innerJoin(reps, eq(reps.id, leads.repId))
    .where(where)
    .get();
  return row?.n ?? 0;
}

function rowSlaState(row: AggRow, now: number, config: SlaConfig): SlaState {
  return getSlaState(
    {
      createdAt: row.lead.createdAt.getTime(),
      touchpointCount: row.touchpointCount,
      lastTouchpointAt: row.lastTouchpointAt,
      status: row.lead.followUpStatus as FollowUpStatus,
    },
    now,
    config,
  );
}

function isBreachedRow(row: AggRow, now: number, config: SlaConfig): boolean {
  return rowSlaState(row, now, config).kind === "overdue";
}

/** DB ordering for plain sorts; deterministic tiebreakers keep pages stable. */
function dbOrderBy(sort: Exclude<LeadSort, "sla">, dir: SortDir): SQL[] {
  const direction = dir === "asc" ? asc : desc;
  const orders: SQL[] = [];
  switch (sort) {
    case "createdAt":
      orders.push(direction(leads.createdAt));
      break;
    case "country":
      orders.push(direction(sql`${leads.country} COLLATE NOCASE`));
      break;
    case "repName":
      orders.push(direction(sql`${reps.name} COLLATE NOCASE`));
      break;
    case "rating":
      // Unrated sorts last in both directions (rating order A < B < C, unrated last).
      orders.push(asc(sql`${leads.rating} IS NULL`));
      orders.push(
        direction(
          sql`CASE ${leads.rating} WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 END`,
        ),
      );
      break;
  }
  orders.push(desc(leads.createdAt), asc(leads.id));
  return orders;
}

/** ASCII case-fold comparison, mirroring SQLite's NOCASE collation. */
function cmpNoCase(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

const RATING_RANK: Record<Rating, number> = { A: 0, B: 1, C: 2 };

/** Same semantics as dbOrderBy, for the in-memory path. */
function plainCompare(sort: Exclude<LeadSort, "sla">, dir: SortDir) {
  const flip = dir === "asc" ? 1 : -1;
  return (a: AggRow, b: AggRow): number => {
    let cmp = 0;
    switch (sort) {
      case "createdAt":
        cmp = a.lead.createdAt.getTime() - b.lead.createdAt.getTime();
        break;
      case "country":
        cmp = cmpNoCase(a.lead.country, b.lead.country);
        break;
      case "repName":
        cmp = cmpNoCase(a.repName, b.repName);
        break;
      case "rating": {
        const nullA = a.lead.rating === null ? 1 : 0;
        const nullB = b.lead.rating === null ? 1 : 0;
        if (nullA !== nullB) return nullA - nullB; // unrated last, both directions
        if (a.lead.rating !== null && b.lead.rating !== null) {
          cmp = RATING_RANK[a.lead.rating] - RATING_RANK[b.lead.rating];
        }
        break;
      }
    }
    if (cmp !== 0) return cmp * flip;
    return tiebreak(a, b);
  };
}

/** createdAt DESC, id ASC — matches the DB tiebreakers, direction-independent. */
function tiebreak(a: AggRow, b: AggRow): number {
  const byCreated = b.lead.createdAt.getTime() - a.lead.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  return a.lead.id < b.lead.id ? -1 : a.lead.id > b.lead.id ? 1 : 0;
}

/**
 * SLA ordering (breached first). asc = most overdue → due soonest
 * → complete → terminal; desc reverses the primary ranking. Tiebreakers stay
 * direction-independent.
 */
function slaCompare(states: Map<string, SlaState>, dir: SortDir) {
  const flip = dir === "asc" ? 1 : -1;
  const rank = (s: SlaState): number =>
    s.kind === "overdue" ? 0 : s.kind === "due" ? 1 : s.kind === "complete" ? 2 : 3;
  return (a: AggRow, b: AggRow): number => {
    const sa = states.get(a.lead.id)!;
    const sb = states.get(b.lead.id)!;
    let cmp = rank(sa) - rank(sb);
    if (cmp === 0 && (sa.kind === "overdue" || sa.kind === "due")) {
      // Earlier deadline = more overdue / due sooner.
      cmp =
        (sa as { deadline: number }).deadline -
        (sb as { deadline: number }).deadline;
    }
    if (cmp !== 0) return cmp * flip;
    return tiebreak(a, b);
  };
}

function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount);
}

/**
 * Count leads for a KPI/compare window: same filters, substituted window.
 * Breach-dependent views evaluate SLA in memory at the shared
 * `now`, exactly like the list itself.
 */
function countForWindow(
  filters: LeadFilters,
  window: DateWindow,
  now: number,
  config: SlaConfig,
): number {
  if (filters.view === "active" || filters.view === "overdue") {
    const rows: AggRow[] = selectLeadsWithAgg(buildLeadWhere(filters, window)).all();
    const wantBreached = filters.view === "overdue";
    return rows.filter((r) => isBreachedRow(r, now, config) === wantBreached)
      .length;
  }
  return countLeadsWhere(buildLeadWhere(filters, window));
}

/** The GET /api/leads orchestration: rows + KPIs + reps in one payload. */
export function listLeads(query: LeadListQuery): LeadsListResponse {
  // One instant per request: every breach evaluation in this response uses
  // the same `now`, so the payload can never disagree with itself.
  const now = Date.now();
  const config = getSlaConfig(process.env);
  const { filters, window, sort, dir } = query;

  const needsSla =
    filters.view === "active" || filters.view === "overdue" || sort === "sla";

  let total: number;
  let overdue: number;
  let active: number;
  let dueSoon: number;
  let page: number;
  let pageCount: number;
  let pageRows: AggRow[];

  if (needsSla) {
    const rows: AggRow[] = selectLeadsWithAgg(buildLeadWhere(filters, window)).all();
    const states = new Map<string, SlaState>(
      rows.map((r) => [r.lead.id, rowSlaState(r, now, config)]),
    );
    const viewRows =
      filters.view === "active"
        ? rows.filter((r) => states.get(r.lead.id)!.kind !== "overdue")
        : filters.view === "overdue"
          ? rows.filter((r) => states.get(r.lead.id)!.kind === "overdue")
          : rows;

    total = viewRows.length;
    overdue = viewRows.filter(
      (r) => states.get(r.lead.id)!.kind === "overdue",
    ).length;
    // Equals rows.length for the active/overdue views (all rows there are
    // already status-active); for the sort=sla/all path it correctly counts
    // status-active leads, excluding terminals — the plan's four in-memory
    // sub-cases in one expression.
    active = rows.filter((r) => states.get(r.lead.id)!.kind !== "terminal").length;
    dueSoon = rows.filter((r) => {
      const s = states.get(r.lead.id)!;
      return s.kind === "due" && s.msRemaining < DUE_SOON_MS;
    }).length;

    const sorted = [...viewRows].sort(
      sort === "sla" ? slaCompare(states, dir) : plainCompare(sort, dir),
    );
    pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = clampPage(query.page, pageCount);
    pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    // Plain path (view all/closed, plain sort): DB-level sort + pagination.
    const where = buildLeadWhere(filters, window);
    total = countLeadsWhere(where);
    pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = clampPage(query.page, pageCount);
    pageRows = selectLeadsWithAgg(where)
      .orderBy(...dbOrderBy(sort as Exclude<LeadSort, "sla">, dir))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .all();

    if (filters.view === "closed") {
      overdue = 0; // terminal-only dataset: nothing to scan
      dueSoon = 0; // ditto — no scan
      active = countLeadsWhere(buildLeadWhere({ ...filters, view: "active" }, window));
    } else {
      const activeRows: AggRow[] = selectLeadsWithAgg(
        buildLeadWhere({ ...filters, view: "active" }, window),
      ).all();
      let overdueCount = 0;
      let dueSoonCount = 0;
      for (const r of activeRows) {
        // Single pass: one SLA-state evaluation per row feeds both counts.
        const state = rowSlaState(r, now, config);
        if (state.kind === "overdue") overdueCount++;
        else if (state.kind === "due" && state.msRemaining < DUE_SOON_MS) dueSoonCount++;
      }
      overdue = overdueCount;
      dueSoon = dueSoonCount;
      active = activeRows.length;
    }
  }

  // Weekly KPIs substitute their own Monday-week windows for the date range;
  // all other filters (view breach predicate included) still apply.
  const thisWeek = thisWeekRange(new Date(now));
  const lastWeek = lastWeekRange(new Date(now));
  const assignedThisWeek = countForWindow(
    filters,
    { from: thisWeek.start.getTime(), to: thisWeek.end.getTime() },
    now,
    config,
  );
  const assignedLastWeek = countForWindow(
    filters,
    { from: lastWeek.start.getTime(), to: lastWeek.end.getTime() },
    now,
    config,
  );
  const compareCount = query.compareWindow
    ? countForWindow(filters, query.compareWindow, now, config)
    : null;

  // Rep dropdown: every filter except the rep filter itself.
  // Local var named repOptions, not reps — the latter is the imported table.
  const repFilters: LeadFilters = { ...filters, rep: null };
  let repOptions: { id: string; name: string }[];
  if (repFilters.view === "active" || repFilters.view === "overdue") {
    const rows: AggRow[] = selectLeadsWithAgg(
      buildLeadWhere(repFilters, window),
    ).all();
    const wantBreached = repFilters.view === "overdue";
    const byId = new Map<string, string>();
    for (const r of rows) {
      if (isBreachedRow(r, now, config) === wantBreached) {
        byId.set(r.lead.repId, r.repName);
      }
    }
    repOptions = [...byId].map(([id, name]) => ({ id, name }));
  } else {
    repOptions = getDb()
      .selectDistinct({ id: leads.repId, name: reps.name })
      .from(leads)
      .innerJoin(reps, eq(reps.id, leads.repId))
      .where(buildLeadWhere(repFilters, window))
      .all();
  }
  repOptions.sort((a, b) => cmpNoCase(a.name, b.name));

  return {
    leads: pageRows.map((r) =>
      toLeadRowWire(r.lead, r.repName, r.touchpointCount, r.lastTouchpointAt),
    ),
    page,
    pageSize: PAGE_SIZE,
    pageCount,
    kpis: {
      total,
      overdue,
      active,
      dueSoon,
      assignedThisWeek,
      assignedLastWeek,
      compareCount,
    },
    reps: repOptions,
    slaConfig: config,
  };
}
