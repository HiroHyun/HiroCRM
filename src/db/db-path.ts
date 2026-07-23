// One module owns the DB file location.
// Imported by both drizzle.config.ts (drizzle-kit CLI) and src/db/index.ts (runtime).
//
// Owner decision (2026-07-11): no user-facing DB_PATH configuration in v1.0 —
// the database lives at ./dev.db, full stop.
// Amendment (2026-07-24, owner-approved): HIROCRM_DATA_DIR is an INTERNAL
// test hook so the API smoke suite can point a spawned server at a temp
// directory without moving the repository's live database (Codex audit M3;
// a `next dev <dir>` cwd bug on Windows ruled out the no-env alternative).
// It is deliberately undocumented in README/OPERATIONS and unsupported for
// deployments: leave it unset.
import path from "node:path";

const dataDir = process.env.HIROCRM_DATA_DIR;

export const DB_PATH = dataDir ? path.join(dataDir, "dev.db") : "./dev.db";
