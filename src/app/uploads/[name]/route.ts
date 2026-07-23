import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "../../../server/auth";
import { uploadFilePath } from "../../../server/upload-storage";
import {
  contentTypeForStoredName,
  isStoredUploadName,
} from "../../../server/uploads";

type Ctx = { params: Promise<{ name: string }> };

/**
 * Serves /uploads/<name> — the ONLY serving path in both dev and prod:
 * screenshot storage lives at data/uploads/, outside `public/`, so
 * there's no static-file fallback to fall back on. Session-guarded (401
 * without a session) since screenshots are no longer public assets, and
 * cached `private, no-store` accordingly. Names are whitelisted: one path
 * segment, safe charset, allowlisted image extension.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  const { name } = await ctx.params;
  if (!isStoredUploadName(name)) return new NextResponse(null, { status: 404 });
  try {
    const data = await readFile(
      /* turbopackIgnore: true */ uploadFilePath(name),
    );
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": contentTypeForStoredName(name),
        // Private per-request asset now (session-guarded, not a public
        // folder file) — never cached by shared caches or reused disk cache.
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
