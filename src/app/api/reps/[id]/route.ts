import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../db";
import { leads, reps } from "../../../../db/schema";
import type { RepWire } from "../../../../lib/api-types";
import { requireSession } from "../../../../server/auth";
import { jsonError, readJsonObject } from "../../../../server/http";
import {
  findRepByNameKey,
  getRep,
  leadCountForRep,
  parseRepName,
  repNameKey,
} from "../../../../server/rep-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edit one rep field per call: rename (dup-check excluding self),
 * active toggle, or merge-into (repoint every lead then delete the source,
 * one synchronous transaction — better-sqlite3 rejects promise-returning
 * callbacks at runtime while compiling green).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJsonObject(req);
  if (!body.ok) return body.response;

  const presentKeys = (["name", "active", "mergeIntoId"] as const).filter(
    (key) => key in body.value,
  );
  if (presentKeys.length !== 1) return jsonError(400, "invalid_body");

  try {
    const rep = getRep(id);
    if (!rep) return jsonError(404, "not_found");

    if ("name" in body.value) {
      const name = parseRepName(body.value.name);
      if (name === null) return jsonError(400, "invalid_name");
      const nameKey = repNameKey(name);
      const dup = findRepByNameKey(nameKey);
      if (dup && dup.id !== id) {
        return jsonError(409, "duplicate_rep", { duplicateId: dup.id });
      }
      const updates: Partial<typeof reps.$inferInsert> = { name, nameKey };
      const updated = getDb()
        .update(reps)
        .set(updates)
        .where(eq(reps.id, id))
        .returning()
        .get();
      const payload: RepWire = {
        id: updated!.id,
        name: updated!.name,
        active: updated!.active,
        createdAt: updated!.createdAt.getTime(),
        leadCount: leadCountForRep(id),
      };
      return NextResponse.json(payload);
    }

    if ("active" in body.value) {
      const active = body.value.active;
      if (typeof active !== "boolean") return jsonError(400, "invalid_body");
      const updates: Partial<typeof reps.$inferInsert> = { active };
      const updated = getDb()
        .update(reps)
        .set(updates)
        .where(eq(reps.id, id))
        .returning()
        .get();
      const payload: RepWire = {
        id: updated!.id,
        name: updated!.name,
        active: updated!.active,
        createdAt: updated!.createdAt.getTime(),
        leadCount: leadCountForRep(id),
      };
      return NextResponse.json(payload);
    }

    // mergeIntoId
    const targetId = body.value.mergeIntoId;
    if (typeof targetId !== "string") return jsonError(400, "invalid_body");
    if (targetId === id) return jsonError(400, "invalid_merge");
    const target = getRep(targetId);
    if (!target) return jsonError(404, "not_found");

    const moved = getDb().transaction((tx) => {
      const res = tx
        .update(leads)
        .set({ repId: targetId })
        .where(eq(leads.repId, id))
        .run();
      tx.delete(reps).where(eq(reps.id, id)).run();
      return res.changes;
    });
    return NextResponse.json({ moved });
  } catch (err) {
    console.error("PATCH /api/reps/[id] failed:", err);
    return jsonError(500, "internal");
  }
}

/** Delete a rep with zero leads; non-empty rosters must merge first. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const rep = getRep(id);
    if (!rep) return jsonError(404, "not_found");
    if (leadCountForRep(id) > 0) return jsonError(409, "rep_has_leads");
    getDb().delete(reps).where(eq(reps.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/reps/[id] failed:", err);
    return jsonError(500, "internal");
  }
}
