// DB row → wire shape converters. The only place Drizzle's Date objects
// become epoch-ms numbers — the wire format and all math use epoch ms.
// contactKey is server-internal and deliberately never serialized.

import type { Lead, Touchpoint } from "../db/schema";
import type { LeadRowWire, LeadWire, TouchpointWire } from "../lib/api-types";
import type { FollowUpStatus, TouchpointMethod } from "../lib/types";

export function toLeadWire(lead: Lead, repName: string): LeadWire {
  return {
    id: lead.id,
    createdAt: lead.createdAt.getTime(),
    country: lead.country,
    contactInfo: lead.contactInfo,
    repId: lead.repId,
    repName,
    interest: lead.interest,
    note: lead.note,
    screenshotUrls: lead.screenshotUrls,
    // Enum columns are validated on every write path; the DB
    // can only hold vocabulary values.
    followUpStatus: lead.followUpStatus as FollowUpStatus,
    rating: lead.rating,
    archivedAt: lead.archivedAt?.getTime() ?? null,
  };
}

export function toLeadRowWire(
  lead: Lead,
  repName: string,
  touchpointCount: number,
  lastTouchpointAt: number | null,
): LeadRowWire {
  return { ...toLeadWire(lead, repName), touchpointCount, lastTouchpointAt };
}

export function toTouchpointWire(tp: Touchpoint): TouchpointWire {
  return {
    id: tp.id,
    leadId: tp.leadId,
    timestamp: tp.timestamp.getTime(),
    method: tp.method as TouchpointMethod,
    notes: tp.notes,
  };
}
