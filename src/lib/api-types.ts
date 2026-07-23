// The one wire-types module: every API response shape is
// defined here and imported by both server routes and client code, so the
// two can never drift. All datetimes cross the wire as epoch milliseconds —
// the client feeds sla.ts directly, no date parsing at the boundary.
// Error bodies carry machine codes; user-facing copy lives in strings.ts
// and is mapped client-side.

import type {
  FollowUpStatus,
  Rating,
  SlaConfig,
  TouchpointMethod,
} from "./types";

/** Fixed page size. */
export const PAGE_SIZE = 20;

export interface LeadWire {
  id: string;
  createdAt: number;
  country: string;
  contactInfo: string;
  repId: string;
  repName: string;
  interest: string;
  note: string;
  screenshotUrls: string[];
  followUpStatus: FollowUpStatus;
  rating: Rating | null;
  archivedAt: number | null;
}

export interface RepWire {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
  leadCount: number;
}

export interface RepsListResponse {
  reps: RepWire[];
}

/** List/detail row: lead plus the touchpoint facts SLA math needs. */
export interface LeadRowWire extends LeadWire {
  touchpointCount: number;
  lastTouchpointAt: number | null;
}

export interface TouchpointWire {
  id: string;
  leadId: string;
  timestamp: number;
  method: TouchpointMethod;
  notes: string;
}

export interface LeadsKpis {
  /** Leads matching the current filters (all pages). */
  total: number;
  /** Breached active leads across the full filtered dataset. */
  overdue: number;
  /**
   * Denominator of the overdue tile: count of STATUS-ACTIVE leads (breached
   * included) matching the current non-view filters + date window. Always
   * >= overdue. NOT the same set as the Active view (which excludes
   * breached).
   */
  active: number;
  /**
   * Subset of `active`: status-active leads whose SLA state is "due" with
   * less than DUE_SOON_MS remaining.
   */
  dueSoon: number;
  /** Mon–Sun windows, all filters except the date range. */
  assignedThisWeek: number;
  assignedLastWeek: number;
  /** null when compare mode is off. */
  compareCount: number | null;
}

export interface LeadsListResponse {
  leads: LeadRowWire[];
  page: number;
  pageSize: number;
  pageCount: number;
  kpis: LeadsKpis;
  /**
   * Dropdown options for the rep filter, dataset-derived {id,name} pairs
   * (reps join) matching every filter except the rep filter.
   */
  reps: { id: string; name: string }[];
  /** Resolved server-side; the client never reads SLA env vars. */
  slaConfig: SlaConfig;
}

export interface LeadDetailResponse {
  lead: LeadRowWire;
  /** Newest-first. */
  touchpoints: TouchpointWire[];
}

export interface LeadDeleteResponse {
  ok: true;
}

export interface TouchpointCreateResponse {
  touchpoint: TouchpointWire;
  /** The lead after a possible auto-archive. */
  lead: LeadWire;
  autoArchived: boolean;
}

export interface TouchpointDeleteResponse {
  /** The lead after a possible archive revert. */
  lead: LeadWire;
  reverted: boolean;
}

export interface ImportFailedRow {
  /** Spreadsheet row number, header row = 1. */
  row: number;
  /** Machine reason code; client copy maps it. */
  reason: string;
}

/** Real counts of what happened, never optimistic estimates. */
export interface ImportResponse {
  imported: number;
  skippedDuplicates: number;
  failed: ImportFailedRow[];
  /** Reps auto-created during import, by stored name, file order, no duplicates. */
  createdReps: string[];
}

export interface UploadResponse {
  url: string;
}

export interface ApiError {
  error: string;
  /** Present on duplicate-contact 409s. */
  duplicateId?: string;
}
