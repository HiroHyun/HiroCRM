// Data retention sweep: an opt-in,
// dry-run-by-default cleanup of very old archived leads. Three phases run in
// a fixed order so a lead is only ever reported/handled once:
//   1. delete   leads archived long enough ago to purge entirely
//   2. strip    screenshots off leads archived moderately long ago (row
//               itself is kept, only the images are dropped)
//   3. orphan   sweep data/uploads/ for files no lead references
//
// HARD CONSTRAINT (same box constraint as scripts/seed.mjs): plain node ESM,
// imports better-sqlite3 ONLY —
// never drizzle, never the migrator, never a TypeScript module under src/**.
// This script must NEVER create or migrate a database: it opens dev.db with
// fileMustExist so a missing DB is a clear error, not a silent empty one.
// Every domain rule below that normally lives under src/** is re-derived
// here in plain JS, each tagged with the file it mirrors — if those modules'
// behavior ever changes, this file must be updated by hand.
//
// Usage:
//   node scripts/retention.mjs                     dry run, defaults
//   node scripts/retention.mjs --apply              actually delete/strip/unlink
//   node scripts/retention.mjs --image-days 180 --delete-days 730 --apply
//
// Flags:
//   --apply             perform the writes/unlinks. Omit for a no-write dry
//                        run that only prints the plan (the default).
//   --dry-run            explicit synonym for "no --apply" — accepted but a
//                        no-op; every invocation without --apply is already
//                        a dry run.
//   --image-days N       leads archived >= N days ago get their screenshots
//                        stripped (default 365). Accepts --image-days=N too.
//   --delete-days N      leads archived >= N days ago get deleted outright
//                        (default 1825). Accepts --delete-days=N too.

import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "dev.db");
const UPLOADS_DIR = path.join(ROOT, "data", "uploads");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEFAULT_IMAGE_DAYS = 365;
const DEFAULT_DELETE_DAYS = 1825;
const IN_FLIGHT_GUARD_MS = 24 * HOUR;

// ---------- stored-upload-name shape (mirrors src/server/uploads.ts) --------
// One path segment, safe charset, allowlisted extension. Both a validity
// guard before we ever unlink a path built from DB data, and the filter used
// while scanning the uploads directory for orphan candidates.

const UPLOAD_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const STORED_NAME = new RegExp(
  `^[A-Za-z0-9._-]+\\.(${UPLOAD_EXTENSIONS.join("|")})$`,
  "i",
);
// mirrors src/server/uploads.ts WINDOWS_DEVICE_STEM: reserved device names
// (CON.png opens the console, never a file) are never valid stored names.
const WINDOWS_DEVICE_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
function isStoredUploadName(name) {
  return (
    STORED_NAME.test(name) &&
    !name.includes("..") &&
    !WINDOWS_DEVICE_STEM.test(name)
  );
}

// ---------- CLI parsing ----------

function parseArgs(argv) {
  const opts = { apply: false, imageDays: DEFAULT_IMAGE_DAYS, deleteDays: DEFAULT_DELETE_DAYS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      continue; // no-op: absence of --apply already means dry run
    }

    let flag = arg;
    let inlineValue = null;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq !== -1) {
      flag = arg.slice(0, eq);
      inlineValue = arg.slice(eq + 1);
    }

    if (flag === "--image-days" || flag === "--delete-days") {
      let raw = inlineValue;
      if (raw === null) {
        raw = argv[i + 1];
        i++;
      }
      const n = Number(raw);
      if (raw === undefined || !Number.isInteger(n) || n <= 0) {
        console.error(
          `retention: ${flag} requires a positive integer, got ${JSON.stringify(raw)}`,
        );
        process.exit(1);
      }
      if (flag === "--image-days") opts.imageDays = n;
      else opts.deleteDays = n;
      continue;
    }

    console.error(`retention: unknown flag ${JSON.stringify(arg)}`);
    process.exit(1);
  }

  return opts;
}

// ---------- DB open (never creates/migrates — see header) ----------

function openDbOrExit() {
  let client;
  try {
    // fileMustExist: true makes a missing DB throw (SQLITE_CANTOPEN) instead
    // of silently creating an empty one. timeout: 10s busy handler in case a
    // dev server holds a lock momentarily.
    client = new Database(DB_PATH, { fileMustExist: true, timeout: 10000 });
  } catch (err) {
    if (err && err.code === "SQLITE_CANTOPEN") {
      console.error(
        `retention: no dev.db found at ${DB_PATH} — nothing to sweep. ` +
          "Run `node scripts/seed.mjs` or start the app once to create it first.",
      );
    } else {
      console.error(`retention: failed to open dev.db: ${err.message}`);
    }
    process.exit(1);
  }
  // SQLite has foreign_keys OFF per connection by default — without this,
  // deleting a lead would silently orphan its touchpoints instead of
  // cascading (schema declares onDelete: "cascade"; mirrors src/db/index.ts).
  client.pragma("foreign_keys = ON");
  return client;
}

// ---------- shared helpers ----------

/** screenshot_urls is stored as JSON TEXT; an empty list is the literal '[]'. */
function parseScreenshotUrls(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isoOrNa(ms) {
  return ms == null ? "n/a" : new Date(ms).toISOString();
}

function formatLeadLine(action, row, urls) {
  return (
    `  ${action.padEnd(6)} lead=${row.id}  contact=${JSON.stringify(row.contact_info)}` +
    `  archived=${isoOrNa(row.archived_at)}  screenshots=${urls.length}`
  );
}

/**
 * Best-effort unlink of one screenshot URL, guarded by the stored-name rule.
 * ENOENT is silent/expected (already gone). Any other error (EPERM/EBUSY,
 * etc.) is reported honestly and NOT counted as done — the file simply
 * becomes a future run's orphan.
 */
function unlinkScreenshotUrl(url) {
  if (typeof url !== "string") return { attempted: false };
  // Double guard (mirrors src/app/api/leads/[id]/route.ts and seed.mjs
  // resetExistingData): only ever unlink inside data/uploads/, and only a
  // valid stored-name basename — a corrupt row like "/foo/x.png" (basename
  // passes the regex) must never delete a file outside data/uploads.
  if (!url.startsWith("/uploads/")) return { attempted: false };
  const name = path.basename(url);
  if (!isStoredUploadName(name)) return { attempted: false };
  const filePath = path.join(UPLOADS_DIR, name);
  try {
    unlinkSync(filePath);
    return { attempted: true, ok: true };
  } catch (err) {
    if (err.code === "ENOENT") return { attempted: true, ok: true, alreadyGone: true };
    return { attempted: true, ok: false, err };
  }
}

/** Unlinks every screenshot URL for one lead; prints an honest per-file line. */
function unlinkAllScreenshots(urls) {
  let unlinked = 0;
  let failed = 0;
  for (const url of urls) {
    const result = unlinkScreenshotUrl(url);
    if (!result.attempted) continue;
    if (result.ok) {
      unlinked++;
      console.log(
        result.alreadyGone
          ? `    ${url} already gone (ENOENT) — treated as done`
          : `    unlinked ${url}`,
      );
    } else {
      failed++;
      console.error(
        `    FAILED to unlink ${url}: ${result.err.code ?? ""} ${result.err.message} — ` +
          "file remains on disk and becomes a future orphan.",
      );
    }
  }
  return { unlinked, failed };
}

// ---------- Phase 1: delete very old archived leads ----------

function runDeletePhase(client, apply, deleteCutoff) {
  console.log("");
  console.log("-- Phase 1: delete (archived_at < delete cutoff) --");

  const rows = client
    .prepare(
      "SELECT id, contact_info, archived_at, screenshot_urls FROM leads " +
        "WHERE archived_at IS NOT NULL AND archived_at < ?",
    )
    .all(deleteCutoff);

  const deleteStmt = client.prepare("DELETE FROM leads WHERE id = ?");

  let unlinked = 0;
  let unlinkFailed = 0;
  for (const row of rows) {
    const urls = parseScreenshotUrls(row.screenshot_urls);
    console.log(formatLeadLine("DELETE", row, urls));
    if (!apply) continue;
    // Commit the DB delete first (FK cascade removes touchpoints) — THEN
    // best-effort unlink the files. The DB is the source of truth; a failed
    // unlink is recoverable, a lost DB row is not.
    deleteStmt.run(row.id);
    const result = unlinkAllScreenshots(urls);
    unlinked += result.unlinked;
    unlinkFailed += result.failed;
  }

  console.log(
    `  phase 1 summary: ${rows.length} lead(s) ${apply ? "deleted" : "would be deleted"}` +
      (apply ? `, ${unlinked} screenshot file(s) unlinked, ${unlinkFailed} unlink failure(s)` : ""),
  );
  return { count: rows.length, unlinked, unlinkFailed };
}

// ---------- Phase 2: strip screenshots off moderately old archived leads ----

function runStripPhase(client, apply, deleteCutoff, imageCutoff) {
  console.log("");
  console.log("-- Phase 2: image-strip (delete cutoff <= archived_at < image cutoff) --");

  // The >= deleteCutoff clause explicitly excludes phase 1's delete range so
  // dry-run and apply produce the IDENTICAL plan and nothing is double-counted.
  const rows = client
    .prepare(
      "SELECT id, contact_info, archived_at, screenshot_urls FROM leads " +
        "WHERE archived_at IS NOT NULL AND archived_at >= ? AND archived_at < ? " +
        "AND screenshot_urls != '[]'",
    )
    .all(deleteCutoff, imageCutoff);

  const stripStmt = client.prepare("UPDATE leads SET screenshot_urls = '[]' WHERE id = ?");

  let unlinked = 0;
  let unlinkFailed = 0;
  for (const row of rows) {
    const urls = parseScreenshotUrls(row.screenshot_urls);
    console.log(formatLeadLine("STRIP", row, urls));
    if (!apply) continue;
    // Same commit-before-unlink ordering as phase 1.
    stripStmt.run(row.id);
    const result = unlinkAllScreenshots(urls);
    unlinked += result.unlinked;
    unlinkFailed += result.failed;
  }

  console.log(
    `  phase 2 summary: ${rows.length} lead(s) ${apply ? "stripped" : "would be stripped"}` +
      (apply ? `, ${unlinked} screenshot file(s) unlinked, ${unlinkFailed} unlink failure(s)` : ""),
  );
  return { count: rows.length, unlinked, unlinkFailed };
}

// ---------- Phase 3: orphan sweep ----------

function runOrphanPhase(client, apply, now) {
  console.log("");
  console.log("-- Phase 3: orphan sweep (data/uploads/ files no lead references) --");

  if (!existsSync(UPLOADS_DIR)) {
    console.log(`  uploads directory does not exist (${UPLOADS_DIR}) — skipping, nothing to do.`);
    return { count: 0, unlinked: 0, unlinkFailed: 0 };
  }

  // Referenced-file set = union of every CURRENT lead's parsed screenshot_urls
  // basenames. Read at this point: in apply mode, phases 1 & 2 have already
  // committed (better-sqlite3 autocommits each .run() outside an explicit
  // transaction), so this reflects the post-cleanup state.
  const rows = client.prepare("SELECT screenshot_urls FROM leads").all();
  const referenced = new Set();
  for (const row of rows) {
    for (const url of parseScreenshotUrls(row.screenshot_urls)) {
      if (typeof url === "string") referenced.add(path.basename(url));
    }
  }

  const entries = readdirSync(UPLOADS_DIR);
  const orphans = [];
  for (const name of entries) {
    if (!isStoredUploadName(name)) continue; // not a recognizable upload file
    if (referenced.has(name)) continue; // still in use
    const fullPath = path.join(UPLOADS_DIR, name);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue; // vanished between readdir and stat — nothing to do
    }
    if (!stats.isFile()) continue;
    if (stats.mtimeMs >= now - IN_FLIGHT_GUARD_MS) continue; // in-flight-upload guard
    orphans.push(name);
  }

  let unlinked = 0;
  let unlinkFailed = 0;
  for (const name of orphans) {
    console.log(`  ORPHAN file=${name}`);
    if (!apply) continue;
    try {
      unlinkSync(path.join(UPLOADS_DIR, name));
      unlinked++;
      console.log(`    unlinked ${name}`);
    } catch (err) {
      if (err.code === "ENOENT") {
        unlinked++; // already gone
        console.log(`    ${name} already gone (ENOENT) — treated as done`);
        continue;
      }
      unlinkFailed++;
      console.error(`    FAILED to unlink ${name}: ${err.code ?? ""} ${err.message}`);
    }
  }

  console.log(
    `  phase 3 summary: ${orphans.length} orphan file(s) found` +
      (apply
        ? `, ${unlinked} removed, ${unlinkFailed} unlink failure(s)`
        : " (dry run — none removed)"),
  );
  return { count: orphans.length, unlinked, unlinkFailed };
}

// ---------- main ----------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const client = openDbOrExit();

  try {
    const now = Date.now();
    const deleteCutoff = now - opts.deleteDays * DAY;
    const imageCutoff = now - opts.imageDays * DAY;

    console.log(
      opts.apply
        ? "RETENTION — APPLY"
        : "RETENTION — DRY RUN (no changes will be made; pass --apply to execute)",
    );
    console.log("");
    console.log(
      `  image-days:  ${opts.imageDays}  (leads archived before ${new Date(imageCutoff).toISOString()} lose screenshots)`,
    );
    console.log(
      `  delete-days: ${opts.deleteDays}  (leads archived before ${new Date(deleteCutoff).toISOString()} are deleted)`,
    );

    const phase1 = runDeletePhase(client, opts.apply, deleteCutoff);
    const phase2 = runStripPhase(client, opts.apply, deleteCutoff, imageCutoff);
    const phase3 = runOrphanPhase(client, opts.apply, now);

    const totalCandidates = phase1.count + phase2.count + phase3.count;
    const totalUnlinkFailed = phase1.unlinkFailed + phase2.unlinkFailed + phase3.unlinkFailed;

    console.log("");
    if (totalCandidates === 0) {
      console.log("RETENTION: nothing to do — no candidates found in any phase.");
    } else {
      console.log(
        `RETENTION: ${phase1.count} delete, ${phase2.count} strip, ${phase3.count} orphan ` +
          `(${totalCandidates} total)` +
          (opts.apply
            ? totalUnlinkFailed > 0
              ? ` — ${totalUnlinkFailed} file unlink failure(s), see above (recoverable: they become future orphans).`
              : " — all applied cleanly."
            : " — dry run, nothing written. Pass --apply to execute."),
      );
    }
  } finally {
    client.close();
  }
}

main();
