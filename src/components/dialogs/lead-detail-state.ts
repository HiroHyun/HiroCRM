// Pure merge helpers for the lead-detail dialog's mutation-driven liveness.
// Touchpoint create/delete responses carry a LeadWire (no counts) plus the
// authoritative post-transition status; these helpers recompute
// touchpointCount/lastTouchpointAt from the timeline (newest-first) and let
// the server status overwrite the local view, so auto-archive and revert are
// always authoritative on screen.
import type {
  LeadRowWire,
  LeadWire,
  TouchpointCreateResponse,
  TouchpointDeleteResponse,
  TouchpointWire,
} from "../../lib/api-types";

export interface DetailState {
  lead: LeadRowWire;
  touchpoints: TouchpointWire[];
}

function withTimelineFacts(lead: LeadWire, timeline: TouchpointWire[]): LeadRowWire {
  return {
    ...lead,
    touchpointCount: timeline.length,
    lastTouchpointAt: timeline[0]?.timestamp ?? null,
  };
}

/** A save (PATCH) returns a LeadWire; the timeline is unchanged. */
export function applyLeadUpdate(state: DetailState, lead: LeadWire): DetailState {
  return { lead: withTimelineFacts(lead, state.touchpoints), touchpoints: state.touchpoints };
}

/** Touchpoint create: prepend (server-stamped newest) + adopt server status. */
export function applyTouchpointCreate(
  state: DetailState,
  response: TouchpointCreateResponse,
): DetailState {
  const timeline = [response.touchpoint, ...state.touchpoints];
  return { lead: withTimelineFacts(response.lead, timeline), touchpoints: timeline };
}

/** Touchpoint delete: drop by id + adopt server status (revert authoritative). */
export function applyTouchpointDelete(
  state: DetailState,
  deletedId: string,
  response: TouchpointDeleteResponse,
): DetailState {
  const timeline = state.touchpoints.filter((t) => t.id !== deletedId);
  return { lead: withTimelineFacts(response.lead, timeline), touchpoints: timeline };
}
