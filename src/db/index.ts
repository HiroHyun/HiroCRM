import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { DB_PATH } from "./db-path";
import * as schema from "./schema";

function createDb() {
  const client = new Database(DB_PATH);
  // SQLite disables FK enforcement per connection by default; without this,
  // the schema's onDelete: "cascade" never fires.
  client.pragma("foreign_keys = ON");
  client.pragma("journal_mode = WAL");
  const db = drizzle({ client, schema });
  // Auto-init: applies any pending migrations on first open, in both dev and
  // prod, so an empty/missing dev.db just works with no manual `drizzle-kit
  // migrate` step. Synchronous for better-sqlite3 (wraps pending migrations +
  // bookkeeping in one BEGIN/COMMIT) and a provable no-op once the DB is
  // already migrated, so repeated opens (HMR, prod restarts) cost nothing.
  // Never pass `migrationsTable` here — the default table must stay aligned
  // with drizzle-kit and the npm scripts.
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export type Db = ReturnType<typeof createDb>;

// Opened lazily on first query, never at import: `next build` evaluates
// route modules to collect page data across parallel workers, and an eager
// connection there both touches dev.db as a build side effect and collides
// across workers (SQLITE_BUSY on the journal-mode switch). Cached on
// globalThis so next dev's HMR re-evaluation never accumulates open
// better-sqlite3 connections (file locks on Windows). Auto-init (see
// createDb above) runs at that same first-query open, in both dev and prod,
// and is a no-op once already migrated.
const globalForDb = globalThis as unknown as { hiroCrmDb?: Db };

export function getDb(): Db {
  return (globalForDb.hiroCrmDb ??= createDb());
}
