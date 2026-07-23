import { count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../db";
import { leads, reps } from "../../../db/schema";
import type { RepsListResponse, RepWire } from "../../../lib/api-types";
import { requireSession } from "../../../server/auth";
import { jsonError, readJsonObject } from "../../../server/http";
import { isUniqueViolation } from "../../../server/lead-validation";
import {
  findRepByNameKey,
  parseRepName,
  repNameKey,
} from "../../../server/rep-validation";

/** Full roster with lead counts (used by the manage-reps dialog). */
export async function GET(_req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const rows = getDb()
      .select({
        id: reps.id,
        name: reps.name,
        active: reps.active,
        createdAt: reps.createdAt,
        leadCount: count(leads.id),
      })
      .from(reps)
      .leftJoin(leads, eq(leads.repId, reps.id))
      .groupBy(reps.id)
      .orderBy(reps.nameKey)
      .all();

    const payload: RepsListResponse = {
      reps: rows.map(
        (row): RepWire => ({
          id: row.id,
          name: row.name,
          active: row.active,
          createdAt: row.createdAt.getTime(),
          leadCount: Number(row.leadCount),
        }),
      ),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/reps failed:", err);
    return jsonError(500, "internal");
  }
}

/** Create a rep: dup pre-check by nameKey + unique-index race backstop. */
export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;
  const body = await readJsonObject(req);
  if (!body.ok) return body.response;

  const name = parseRepName(body.value.name);
  if (name === null) return jsonError(400, "invalid_name");
  const nameKey = repNameKey(name);

  const existing = findRepByNameKey(nameKey);
  if (existing) {
    return jsonError(409, "duplicate_rep", { duplicateId: existing.id });
  }

  try {
    const values: typeof reps.$inferInsert = { name, nameKey };
    try {
      const rep = getDb().insert(reps).values(values).returning().get();
      const payload: RepWire = {
        id: rep.id,
        name: rep.name,
        active: rep.active,
        createdAt: rep.createdAt.getTime(),
        leadCount: 0,
      };
      return NextResponse.json(payload, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const dup = findRepByNameKey(nameKey);
        return jsonError(409, "duplicate_rep", { duplicateId: dup?.id });
      }
      throw err;
    }
  } catch (err) {
    console.error("POST /api/reps failed:", err);
    return jsonError(500, "internal");
  }
}
