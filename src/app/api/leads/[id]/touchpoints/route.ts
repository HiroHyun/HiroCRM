import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../../db";
import { leads, touchpoints } from "../../../../../db/schema";
import type { TouchpointCreateResponse } from "../../../../../lib/api-types";
import { getSlaConfig } from "../../../../../lib/sla";
import {
  isTerminalStatus,
  type FollowUpStatus,
} from "../../../../../lib/status";
import { TOUCHPOINT_METHODS } from "../../../../../lib/types";
import { requireSession } from "../../../../../server/auth";
import { jsonError, readJsonObject } from "../../../../../server/http";
import { FIELD_LIMITS } from "../../../../../server/lead-validation";
import { getRep } from "../../../../../server/rep-validation";
import { toLeadWire, toTouchpointWire } from "../../../../../server/serialize";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Log a touchpoint: create + auto-archive in ONE transaction.
 * The callback must stay synchronous — better-sqlite3 transactions reject
 * promise-returning functions at runtime while compiling green.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJsonObject(req);
  if (!body.ok) return body.response;

  const method = body.value.method;
  if (
    typeof method !== "string" ||
    !(TOUCHPOINT_METHODS as readonly string[]).includes(method)
  ) {
    return jsonError(400, "invalid_method");
  }
  const notesRaw = body.value.notes;
  const notes = notesRaw === undefined || notesRaw === null ? "" : notesRaw;
  if (typeof notes !== "string" || notes.length > FIELD_LIMITS.touchpointNotes) {
    return jsonError(400, "invalid_notes");
  }

  const config = getSlaConfig(process.env);
  // Server-stamped timestamp only; backdating is
  // deliberately unsupported in v1.0.
  const now = new Date();

  try {
    const result = getDb().transaction((tx) => {
      const lead = tx.select().from(leads).where(eq(leads.id, id)).get();
      if (!lead) return { kind: "not_found" as const };

      const values: typeof touchpoints.$inferInsert = {
        leadId: id,
        method,
        notes,
        timestamp: now,
      };
      const tp = tx.insert(touchpoints).values(values).returning().get();

      const countRow = tx
        .select({ n: sql<number>`count(${touchpoints.id})` })
        .from(touchpoints)
        .where(eq(touchpoints.leadId, id))
        .get();
      const newCount = countRow?.n ?? 0;

      // Auto-archive on newCount >= cap, deliberately not === (an over-cap
      // active lead — possible via seed data or a revert — is considered
      // "complete" once it's at/over the response cap, and archives on its
      // next touchpoint). A terminal lead is never touched: Closed Won stays
      // Closed Won.
      if (
        !isTerminalStatus(lead.followUpStatus as FollowUpStatus) &&
        newCount >= config.responseCap
      ) {
        const updated = tx
          .update(leads)
          .set({ followUpStatus: "Archived", archivedAt: now })
          .where(eq(leads.id, id))
          .returning()
          .get();
        return { kind: "ok" as const, tp, lead: updated!, autoArchived: true };
      }
      return { kind: "ok" as const, tp, lead, autoArchived: false };
    });

    if (result.kind === "not_found") return jsonError(404, "not_found");
    const repName = getRep(result.lead.repId)?.name ?? "";
    const payload: TouchpointCreateResponse = {
      touchpoint: toTouchpointWire(result.tp),
      lead: toLeadWire(result.lead, repName),
      autoArchived: result.autoArchived,
    };
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    console.error("POST /api/leads/[id]/touchpoints failed:", err);
    return jsonError(500, "internal");
  }
}
