import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "../../../server/auth";
import { jsonError, readJsonObject } from "../../../server/http";
import { listLeads, parseLeadListQuery } from "../../../server/lead-query";
import { insertLead, parseLeadCreate } from "../../../server/lead-validation";
import { getRep } from "../../../server/rep-validation";
import { toLeadWire } from "../../../server/serialize";

/** List + KPIs + reps in one payload. */
export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const payload = listLeads(parseLeadListQuery(req.nextUrl.searchParams));
    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/leads failed:", err);
    return jsonError(500, "internal");
  }
}

/** Create with full validation. */
export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;
  const body = await readJsonObject(req);
  if (!body.ok) return body.response;
  const parsed = parseLeadCreate(body.value);
  if (!parsed.ok) return jsonError(400, parsed.error);
  try {
    const rep = getRep(parsed.lead.repId);
    if (!rep) return jsonError(400, "unknown_rep");
    const result = insertLead(parsed.lead, null);
    if (!result.ok) {
      return jsonError(409, "duplicate", {
        duplicateId: result.duplicateId ?? undefined,
      });
    }
    return NextResponse.json(toLeadWire(result.lead, rep.name), { status: 201 });
  } catch (err) {
    console.error("POST /api/leads failed:", err);
    return jsonError(500, "internal");
  }
}
