import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import type { UploadResponse } from "../../../lib/api-types";
import { requireSession } from "../../../server/auth";
import { jsonError } from "../../../server/http";
import {
  UPLOADS_DIR,
  uploadFilePath,
} from "../../../server/upload-storage";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CONTENT_LENGTH_SLACK,
  UPLOAD_TYPES,
} from "../../../server/uploads";

/**
 * Screenshot upload: 10MB cap, MIME allowlist, magic
 * bytes verified against the claimed type, stored name server-derived from
 * the VERIFIED type. Next 16 route handlers impose no body limit of their
 * own — these guards are the only protection, by design.
 *
 * The request budget is enforced BEFORE the body is buffered: Content-Length
 * is required (411 without it — browser fetch always declares it for
 * FormData bodies, and a length-less chunked body would otherwise buffer
 * unbounded), and a declared length over cap+slack 413s immediately. The
 * HTTP layer reads at most the declared length for a fixed-length body, so
 * `req.formData()` below buffers a bounded request. The multipart body must
 * then contain exactly one part, named "file" — extra or duplicate parts are
 * padding with no legitimate sender and are rejected outright.
 */
export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  // Multipart overhead means a legal max-size file arrives with
  // Content-Length > file size, so this check carries slack and file.size
  // below is the authoritative 413.
  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(contentLength)) {
    return jsonError(411, "length_required");
  }
  if (contentLength > MAX_UPLOAD_BYTES + UPLOAD_CONTENT_LENGTH_SLACK) {
    return jsonError(413, "too_large");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "invalid_body");
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "file") {
    return jsonError(400, "invalid_body");
  }
  const file = entries[0][1];
  if (!(file instanceof File)) return jsonError(400, "invalid_body");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "too_large");

  const uploadType = UPLOAD_TYPES[file.type];
  if (!uploadType) return jsonError(415, "unsupported_type");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!uploadType.matchesMagic(data)) return jsonError(415, "unsupported_type");

  try {
    const name = `${crypto.randomUUID()}.${uploadType.extension}`;
    await mkdir(/* turbopackIgnore: true */ UPLOADS_DIR, { recursive: true });
    await writeFile(/* turbopackIgnore: true */ uploadFilePath(name), data);
    const payload: UploadResponse = { url: `/uploads/${name}` };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("POST /api/upload failed:", err);
    return jsonError(500, "internal");
  }
}
