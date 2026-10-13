import { unlinkSync } from "node:fs";
import { asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../db";
import { leads, touchpoints } from "../../../../db/schema";
import type {
  LeadDeleteResponse,
  LeadDetailResponse,
} from "../../../../lib/api-types";
import type { FollowUpStatus } from "../../../../lib/status";
import { requireSession } from "../../../../server/auth";
import { jsonError, readJsonObject } from "../../../../server/http";
import {
  archivedAtTransition,
  findDuplicateId,
  isUniqueViolation,
  parseLeadPatch,
} from "../../../../server/lead-validation";
import { getRep } from "../../../../server/rep-validation";
import {
  toLeadRowWire,
  toLeadWire,
  toTouchpointWire,
} from "../../../../server/serialize";
import { uploadFilePath } from "../../../../server/upload-storage";
import { isStoredUploadName } from "../../../../server/uploads";

type Ctx = { params: Promise<{ id: string }> };

/** Detail: lead + newest-first touchpoint timeline. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const lead = getDb().select().from(leads).where(eq(leads.id, id)).get();
    if (!lead) return jsonError(404, "not_found");
    const tps = getDb()
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.leadId, id))
      .orderBy(desc(touchpoints.timestamp), asc(touchpoints.id))
      .all();
    const lastTouchpointAt = tps[0]?.timestamp.getTime() ?? null;
    const rep = getRep(lead.repId);
    const payload: LeadDetailResponse = {
      lead: toLeadRowWire(lead, rep?.name ?? "", tps.length, lastTouchpointAt),
      touchpoints: tps.map(toTouchpointWire),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/leads/[id] failed:", err);
    return jsonError(500, "internal");
  }
}

/** Edit with the same rules as create; duplicate excludes self. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJsonObject(req);
  if (!body.ok) return body.response;
  const parsed = parseLeadPatch(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const existing = getDb().select().from(leads).where(eq(leads.id, id)).get();
    if (!existing) return jsonError(404, "not_found");

    if (parsed.patch.contactKey !== undefined) {
      const dup = findDuplicateId(parsed.patch.contactKey, id);
      if (dup !== null) return jsonError(409, "duplicate", { duplicateId: dup });
    }

    if (parsed.patch.repId !== undefined) {
      const rep = getRep(parsed.patch.repId);
      if (!rep) return jsonError(400, "unknown_rep");
    }

    const transition =
      parsed.patch.followUpStatus !== undefined
        ? archivedAtTransition(
            existing.followUpStatus as FollowUpStatus,
            parsed.patch.followUpStatus,
            new Date(),
          )
        : {};
    const updates: Partial<typeof leads.$inferInsert> = {
      ...parsed.patch,
      ...transition,
    };
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        toLeadWire(existing, getRep(existing.repId)?.name ?? ""),
      );
    }

    try {
      const updated = getDb()
        .update(leads)
        .set(updates)
        .where(eq(leads.id, id))
        .returning()
        .get();
      return NextResponse.json(
        toLeadWire(updated, getRep(updated.repId)?.name ?? ""),
      );
    } catch (err) {
      // Race backstop on the unique contactKey index.
      if (isUniqueViolation(err) && parsed.patch.contactKey !== undefined) {
        const dup = findDuplicateId(parsed.patch.contactKey, id);
        return jsonError(409, "duplicate", { duplicateId: dup ?? undefined });
      }
      throw err;
    }
  } catch (err) {
    console.error("PATCH /api/leads/[id] failed:", err);
    return jsonError(500, "internal");
  }
}

/**
 * Delete lead; FK cascade removes its touchpoints. Screenshot files are
 * unlinked only after the DB delete commits, best-effort — a failed unlink
 * leaves an orphan for the retention sweep rather than failing the delete.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const existing = getDb().select().from(leads).where(eq(leads.id, id)).get();
    if (!existing) return jsonError(404, "not_found");
    getDb().delete(leads).where(eq(leads.id, id)).run();

    // Separate from the committed delete: hold a write lock while checking
    // shared references and unlinking, so retention/API writers cannot race.
    getDb().transaction((tx) => {
      for (const url of existing.screenshotUrls) {
        const name = url.slice("/uploads/".length);
        if (!url.startsWith("/uploads/") || !isStoredUploadName(name)) continue;
        const referenced = tx.select({ id: leads.id }).from(leads).where(
          sql`exists (select 1 from json_each(${leads.screenshotUrls}) where value = ${url})`,
        ).get();
        if (referenced) continue;
        try {
          unlinkSync(uploadFilePath(name));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.error(`DELETE /api/leads/[id]: unlink ${name} failed:`, err);
          }
        }
      }
    }, { behavior: "immediate" });

    const payload: LeadDeleteResponse = { ok: true };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("DELETE /api/leads/[id] failed:", err);
    return jsonError(500, "internal");
  }
}
