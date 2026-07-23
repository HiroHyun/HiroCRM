import { describe, expect, it } from "vitest";
import type { LeadRowWire, LeadWire, TouchpointWire } from "../../lib/api-types";
import {
  applyLeadUpdate,
  applyTouchpointCreate,
  applyTouchpointDelete,
  type DetailState,
} from "./lead-detail-state";

function tp(id: string, timestamp: number): TouchpointWire {
  return { id, leadId: "L", timestamp, method: "WhatsApp", notes: "" };
}
function baseLead(over: Partial<LeadWire> = {}): LeadWire {
  return {
    id: "L", createdAt: 0, country: "", contactInfo: "c", repId: "r", repName: "rn",
    interest: "", note: "", screenshotUrls: [], followUpStatus: "Pending",
    rating: null, archivedAt: null, ...over,
  };
}
function rowLead(count: number, last: number | null, over: Partial<LeadWire> = {}): LeadRowWire {
  return { ...baseLead(over), touchpointCount: count, lastTouchpointAt: last };
}

describe("applyTouchpointCreate", () => {
  it("prepends and derives counts below the cap", () => {
    const state: DetailState = { lead: rowLead(0, null), touchpoints: [] };
    const next = applyTouchpointCreate(state, {
      touchpoint: tp("t1", 1000),
      lead: baseLead({ followUpStatus: "Pending" }),
      autoArchived: false,
    });
    expect(next.touchpoints).toHaveLength(1);
    expect(next.lead.touchpointCount).toBe(1);
    expect(next.lead.lastTouchpointAt).toBe(1000);
    expect(next.lead.followUpStatus).toBe("Pending");
  });
  it("adopts the server's auto-archive status", () => {
    const state: DetailState = {
      lead: rowLead(2, 2000, { followUpStatus: "In Communication" }),
      touchpoints: [tp("t2", 2000), tp("t1", 1000)],
    };
    const next = applyTouchpointCreate(state, {
      touchpoint: tp("t3", 3000),
      lead: baseLead({ followUpStatus: "Archived", archivedAt: 3000 }),
      autoArchived: true,
    });
    expect(next.lead.touchpointCount).toBe(3);
    expect(next.lead.lastTouchpointAt).toBe(3000);
    expect(next.lead.followUpStatus).toBe("Archived");
    expect(next.lead.archivedAt).toBe(3000);
    expect(next.touchpoints[0].id).toBe("t3");
  });
});

describe("applyTouchpointDelete", () => {
  it("reverts to In Communication with touchpoints remaining", () => {
    const state: DetailState = {
      lead: rowLead(3, 3000, { followUpStatus: "Archived", archivedAt: 3000 }),
      touchpoints: [tp("t3", 3000), tp("t2", 2000), tp("t1", 1000)],
    };
    const next = applyTouchpointDelete(state, "t3", {
      lead: baseLead({ followUpStatus: "In Communication", archivedAt: null }),
      reverted: true,
    });
    expect(next.lead.touchpointCount).toBe(2);
    expect(next.lead.lastTouchpointAt).toBe(2000);
    expect(next.lead.followUpStatus).toBe("In Communication");
    expect(next.lead.archivedAt).toBeNull();
  });
  it("reverts to Pending at zero touchpoints", () => {
    const state: DetailState = {
      lead: rowLead(1, 1000, { followUpStatus: "Archived", archivedAt: 1000 }),
      touchpoints: [tp("t1", 1000)],
    };
    const next = applyTouchpointDelete(state, "t1", {
      lead: baseLead({ followUpStatus: "Pending", archivedAt: null }),
      reverted: true,
    });
    expect(next.lead.touchpointCount).toBe(0);
    expect(next.lead.lastTouchpointAt).toBeNull();
    expect(next.lead.followUpStatus).toBe("Pending");
  });
});

describe("applyLeadUpdate", () => {
  it("keeps timeline facts and adopts the saved fields", () => {
    const state: DetailState = {
      lead: rowLead(2, 2000),
      touchpoints: [tp("t2", 2000), tp("t1", 1000)],
    };
    const next = applyLeadUpdate(state, baseLead({ followUpStatus: "Quoted", rating: "A" }));
    expect(next.lead.touchpointCount).toBe(2);
    expect(next.lead.lastTouchpointAt).toBe(2000);
    expect(next.lead.followUpStatus).toBe("Quoted");
    expect(next.lead.rating).toBe("A");
  });
});
