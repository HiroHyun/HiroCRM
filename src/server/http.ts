// Boundary helpers for route handlers: one guarded
// JSON parse and one structured-error shape. Error bodies are machine codes
// only — internals go to the server log, user-facing copy is mapped
// client-side from strings.ts.

import { NextResponse } from "next/server";
import type { ApiError } from "../lib/api-types";

export function jsonError(
  status: number,
  error: string,
  extra?: Omit<ApiError, "error">,
): NextResponse {
  return NextResponse.json({ error, ...extra } satisfies ApiError, { status });
}

export type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/**
 * JSON body budget. Route handlers buffer the body before parsing, so the
 * declared length is checked first: a body over this cap 413s before a byte
 * is read, and a length-less (chunked) body 411s — every legitimate client
 * of this API (browser fetch, curl) declares Content-Length on JSON writes.
 * Far above any real payload (largest write is a lead with 20 screenshot
 * URLs), far below anything that could hurt the process.
 */
export const MAX_JSON_BYTES = 1024 * 1024;

/** Reject unbounded or malformed requests before buffering JSON or multipart. */
export function checkContentLength(req: Request, maxBytes: number): NextResponse | null {
  const raw = req.headers.get("content-length");
  if (raw === null || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    return jsonError(411, "length_required");
  }
  return Number(raw) > maxBytes ? jsonError(413, "too_large") : null;
}

/**
 * The one guarded body parse every mutation route uses: malformed JSON or a
 * non-object body (array, null, primitive) → structured 400, an undeclared
 * or over-budget length → 411/413, never a 500.
 */
export async function readJsonObject(req: Request): Promise<JsonObjectResult> {
  const denied = checkContentLength(req, MAX_JSON_BYTES);
  if (denied) return { ok: false, response: denied };
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, "invalid_json") };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: jsonError(400, "invalid_json") };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
