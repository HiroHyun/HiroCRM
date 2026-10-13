import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { runInNewContext } from "node:vm";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

type Client = InstanceType<typeof Database>;
type PhaseResult = { count: number; unlinked: number; unlinkFailed: number };

function loadRetention(unlinkSync = vi.fn()) {
  // Load the CLI's real phase functions without opening its deployment DB.
  const source = readFileSync(path.join(process.cwd(), "scripts/retention.mjs"), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/main\(\);\s*$/, "({ runDeletePhase, runStripPhase, runOrphanPhase });");
  const phases = runInNewContext(source, {
    path, process, Database, unlinkSync,
    console: { log: vi.fn(), error: vi.fn() },
    existsSync: () => true, readdirSync: () => ["shared.png"],
    statSync: () => ({ isFile: () => true, mtimeMs: 0 }),
  }) as {
    runDeletePhase: (db: Client, apply: boolean, cutoff: number) => PhaseResult;
    runStripPhase: (db: Client, apply: boolean, deleteCutoff: number, imageCutoff: number) => PhaseResult;
    runOrphanPhase: (db: Client, apply: boolean, now: number) => PhaseResult;
  };
  return { ...phases, unlinkSync };
}

function fixture() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE leads (id TEXT PRIMARY KEY, contact_info TEXT, archived_at INTEGER, screenshot_urls TEXT);");
  db.prepare("INSERT INTO leads VALUES (?, ?, ?, ?)").run("old", "old@example.com", 10, '["/uploads/shared.png"]');
  return db;
}

describe("retention concurrent edits and shared screenshots", () => {
  it.each(["delete", "strip"])("%s skips a lead reactivated after candidate selection", (phase) => {
    const db = fixture();
    const prepare = db.prepare.bind(db);
    const spy = vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      const stmt = prepare(sql);
      if (sql.startsWith("SELECT id, contact_info")) {
        const all = stmt.all.bind(stmt);
        stmt.all = (...args: unknown[]) => {
          const rows = all(...args);
          prepare("UPDATE leads SET archived_at = NULL WHERE id = 'old'").run();
          return rows;
        };
      }
      return stmt;
    });
    const phases = loadRetention();
    try {
      const result = phase === "delete"
        ? phases.runDeletePhase(db, true, 20)
        : phases.runStripPhase(db, true, 0, 20);
      expect(result.count).toBe(0);
      expect(prepare("SELECT archived_at, screenshot_urls FROM leads WHERE id = 'old'").get())
        .toEqual({ archived_at: null, screenshot_urls: '["/uploads/shared.png"]' });
      expect(phases.unlinkSync).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); db.close(); }
  });

  it.each(["delete", "strip"])("%s preserves a screenshot referenced by an active lead", (phase) => {
    const db = fixture();
    db.prepare("INSERT INTO leads VALUES (?, ?, ?, ?)")
      .run("active", "active@example.com", null, '["/uploads/shared.png"]');
    const phases = loadRetention();
    try {
      const result = phase === "delete"
        ? phases.runDeletePhase(db, true, 20)
        : phases.runStripPhase(db, true, 0, 20);
      expect(result.count).toBe(1);
      expect(phases.unlinkSync).not.toHaveBeenCalled();
      expect(db.prepare("SELECT screenshot_urls FROM leads WHERE id = 'active'").get())
        .toEqual({ screenshot_urls: '["/uploads/shared.png"]' });
    } finally { db.close(); }
  });

  it.each(["delete", "strip"])("%s unlinks an unshared screenshot after the mutation under a write lock", (phase) => {
    const db = fixture();
    const unlink = vi.fn(() => {
      expect(db.inTransaction).toBe(true);
      const old = db.prepare("SELECT screenshot_urls FROM leads WHERE id = 'old'").get();
      expect(old).toEqual(phase === "delete" ? undefined : { screenshot_urls: "[]" });
    });
    const phases = loadRetention(unlink);
    try {
      const result = phase === "delete"
        ? phases.runDeletePhase(db, true, 20)
        : phases.runStripPhase(db, true, 0, 20);
      expect(result).toEqual({ count: 1, unlinked: 1, unlinkFailed: 0 });
      expect(unlink).toHaveBeenCalledOnce();
    } finally { db.close(); }
  });

  it("orphan sweep preserves a reference added after candidate selection", () => {
    const db = fixture();
    db.exec("UPDATE leads SET screenshot_urls = '[]'");
    const prepare = db.prepare.bind(db);
    const spy = vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      const stmt = prepare(sql);
      if (sql === "SELECT screenshot_urls FROM leads") {
        const all = stmt.all.bind(stmt);
        stmt.all = (...args: unknown[]) => {
          const rows = all(...args);
          prepare("UPDATE leads SET screenshot_urls = ? WHERE id = 'old'")
            .run('["/uploads/shared.png"]');
          return rows;
        };
      }
      return stmt;
    });
    const phases = loadRetention();
    try {
      const result = phases.runOrphanPhase(db, true, 2 * 24 * 3_600_000);
      expect(result.unlinked).toBe(0);
      expect(phases.unlinkSync).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); db.close(); }
  });
});
