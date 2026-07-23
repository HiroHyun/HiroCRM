// Server-only filesystem-path half of the upload story. Screenshot storage
// lives outside `public/` at `data/uploads/` so
// there's no static-file fallback and the /uploads/[name] route is the only
// serving path. Pure validation/caps stay in src/server/uploads.ts, which is
// imported by a client component and must never gain node:fs/node:path —
// this module exists only to hold the filesystem-touching half. Callers
// validate first (isStoredUploadName at the call site), and uploadFilePath
// re-validates as defense in depth: an unvalidated name reaching it is a
// caller bug, surfaced by throwing rather than by resolving a path outside
// the uploads directory.

import path from "node:path";
import { isStoredUploadName } from "./uploads";

// HIROCRM_DATA_DIR: internal test hook, same contract as src/db/db-path.ts —
// the smoke suite redirects data writes to a temp dir; unset everywhere else.
export const UPLOADS_DIR = path.join(
  /* turbopackIgnore: true */ process.env.HIROCRM_DATA_DIR ?? process.cwd(),
  "data",
  "uploads",
);

export function uploadFilePath(name: string): string {
  if (!isStoredUploadName(name)) {
    throw new Error(`uploadFilePath: unsafe stored name rejected`);
  }
  return path.join(/* turbopackIgnore: true */ UPLOADS_DIR, name);
}
