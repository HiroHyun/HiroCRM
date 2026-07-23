import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../db";
import { leads, touchpoints } from "../../../../db/schema";
import type { TouchpointDeleteResponse } from "../../../../lib/api-types";
import { getSlaConfig } from "../../../../lib/sla";
import type { FollowUpStatus } from "../../../../lib/status";
import { requireSession } from "../../../../server/auth";
import { jsonError } from "../../../../server/http";
import { getRep } from "../../../../server/rep-validation";
import { toLeadWire } from "../../../../server/serialize";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Delete a touchpoint: delete + archive-revert in ONE sync
 * transaction. Revert rule: only status
 * `Archived` — auto-archive's sole target — crossing the cap boundary
 * downward reverts, to `In Communication` when touchpoints remain and
 * `Pending` when none do. Closed Won/Lost never move; manual archives below
 * the cap never cross the boundary, so they never revert.
 * Known approximation: a manually archived lead sitting
 * exactly at the cap also reverts when crossing downward.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  const config = getSlaConfig(process.env);

  try {
    const result = getDb().transaction((tx) => {
      const tp = tx
        .select()
        .from(touchpoints)
        .where(eq(touchpoints.id, id))
        .get();
      if (!tp) return { kind: "not_found" as const };

      const beforeRow = tx
        .select({ n: sql<number>`count(${touchpoints.id})` })
        .from(touchpoints)
        .where(eq(touchpoints.leadId, tp.leadId))
        .get();
      const before = beforeRow?.n ?? 0;

      tx.delete(touchpoints).where(eq(touchpoints.id, id)).run();
      const after = before - 1;

      const lead = tx.select().from(leads).where(eq(leads.id, tp.leadId)).get();
      if (!lead) return { kind: "not_found" as const }; // unreachable (FK); defensive

      if (
        lead.followUpStatus === "Archived" &&
        before >= config.responseCap &&
        after < config.responseCap
      ) {
        const target: FollowUpStatus = after > 0 ? "In Communication" : "Pending";
        const updated = tx
          .update(leads)
          .set({ followUpStatus: target, archivedAt: null })
          .where(eq(leads.id, lead.id))
          .returning()
          .get();
        return { kind: "ok" as const, lead: updated!, reverted: true };
      }
      return { kind: "ok" as const, lead, reverted: false };
    });

    if (result.kind === "not_found") return jsonError(404, "not_found");
    const repName = getRep(result.lead.repId)?.name ?? "";
    const payload: TouchpointDeleteResponse = {
      lead: toLeadWire(result.lead, repName),
      reverted: result.reverted,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("DELETE /api/touchpoints/[id] failed:", err);
    return jsonError(500, "internal");
  }
}
