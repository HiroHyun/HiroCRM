// Product-demo seed script: fills an
// empty dev.db with ~40 fictional international leads so a fresh self-hoster
// gets a dashboard that already looks alive on first `npm run dev` — every
// status, several ratings (incl. unrated), and every SLA state the spec
// describes, plus a couple of screenshots and a couple of deliberately-old
// "retention candidate" leads for exercising `npm run retention` later.
//
// HARD CONSTRAINT: this is
// plain node ESM and never imports a TypeScript module under src/**. Every
// rule normally owned by src/lib/{sla,status,contact}.ts or
// src/server/uploads.ts is re-derived here in plain JS, each comment tagged
// with the file it mirrors. If those modules' behavior ever changes, this
// file must be updated by hand.
//
// Usage:
//   node scripts/seed.mjs             seed an empty dev.db (refuses if it
//                                      already holds leads)
//   node scripts/seed.mjs --reset     wipe existing leads (+ their uploaded
//                                      screenshot files) and reseed

import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "dev.db");
const UPLOADS_DIR = path.join(ROOT, "data", "uploads");
const SEED_ASSETS = ["sample-1.png", "sample-2.png", "sample-3.png"].map(
  (f) => path.join(ROOT, "scripts", "seed-assets", f),
);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ---------- SLA math (mirrors src/lib/sla.ts:10-14,66-80,98-109 — do not ----
// ---------- import, see header) ----------

// Mirrors DEFAULT_SLA_CONFIG (src/lib/sla.ts:10-14). Inlined as literals —
// this script never reads SLA_* env vars, so its own "SLA state" summary at
// the end reflects the *defaults*, not any operator override in .env.
const FIRST_RESPONSE_HOURS = 72;
const FOLLOW_UP_HOURS = 120;
const RESPONSE_CAP = 3;

// Mirrors STATUS_DEFS (src/lib/status.ts:10-21): six values, three terminal.
const TERMINAL_STATUSES = ["Closed Won", "Lost", "Archived"];
const ACTIVE_STATUSES = ["Pending", "In Communication", "Quoted"];
const ALL_STATUSES = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];
function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

/** Mirrors slaDeadline() (src/lib/sla.ts:66-80). */
function slaDeadline({ createdAt, touchpointCount, lastTouchpointAt }) {
  if (touchpointCount >= RESPONSE_CAP) return null;
  if (touchpointCount === 0 || lastTouchpointAt === null) {
    return createdAt + FIRST_RESPONSE_HOURS * HOUR;
  }
  return lastTouchpointAt + FOLLOW_UP_HOURS * HOUR;
}

/** Mirrors getSlaState() (src/lib/sla.ts:98-109). */
function getSlaState(input, now) {
  if (isTerminalStatus(input.status)) return { kind: "terminal" };
  const deadline = slaDeadline(input);
  if (deadline === null) return { kind: "complete" };
  return now > deadline
    ? { kind: "overdue", deadline, msOverdue: now - deadline }
    : { kind: "due", deadline, msRemaining: deadline - now };
}

// ---------- contact dedup key (mirrors src/lib/contact.ts normalizeContactKey,
// canonical identity) ----------

const KEY_SEPARATORS = /[\s().\p{Pd}−]/gu;

function normalizeContactKey(raw) {
  const pipeIndex = raw.indexOf("|");
  const head = (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
  if (head === "") return null;

  if (head.includes("@")) return head.toLowerCase();

  let candidate = null;
  const plusIndex = head.indexOf("+");
  if (plusIndex !== -1) {
    candidate = head.slice(plusIndex);
  } else {
    const strippedHead = head.replace(KEY_SEPARATORS, "");
    if (strippedHead.startsWith("00")) candidate = strippedHead;
  }
  if (candidate !== null) {
    const stripped = candidate.replace(KEY_SEPARATORS, "");
    const cleaned = stripped.startsWith("00")
      ? `+${stripped.slice(2)}`
      : stripped;
    if (/^\+\d+$/.test(cleaned)) {
      const parsed = parsePhoneNumberFromString(cleaned, { extract: false });
      if (parsed?.isValid()) return parsed.number;
    }
  }

  return head
    .toLowerCase()
    .replace(/\p{White_Space}+/gu, " ")
    .trim();
}

// ---------- stored-upload-name shape (mirrors src/server/uploads.ts) --------

const UPLOAD_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const STORED_NAME = new RegExp(
  `^[A-Za-z0-9._-]+\\.(${UPLOAD_EXTENSIONS.join("|")})$`,
  "i",
);
// mirrors src/server/uploads.ts WINDOWS_DEVICE_STEM.
const WINDOWS_DEVICE_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
function isStoredUploadName(name) {
  return (
    STORED_NAME.test(name) &&
    !name.includes("..") &&
    !WINDOWS_DEVICE_STEM.test(name)
  );
}

// ---------- DB open + migrate ----------

function openDb() {
  const client = new Database(DB_PATH);
  // Mirrors src/db/index.ts's connection setup so the seeded file behaves
  // exactly like the app's own runtime connection.
  client.pragma("foreign_keys = ON");
  client.pragma("journal_mode = WAL");
  // Synchronous for better-sqlite3, needs no schema, and is a no-op once the
  // DB is already migrated — creates leads/touchpoints identically to the
  // app's own auto-init (src/db/index.ts).
  migrate(drizzle(client), { migrationsFolder: path.join(ROOT, "drizzle") });
  return client;
}

// ---------- reset: unlink previously-seeded upload files, then wipe rows ----

function resetExistingData(client) {
  const rows = client.prepare("SELECT screenshot_urls FROM leads").all();
  let unlinked = 0;
  let unlinkErrors = 0;
  for (const row of rows) {
    let urls;
    try {
      urls = JSON.parse(row.screenshot_urls);
    } catch {
      continue; // malformed JSON in an old row — nothing we can unlink safely
    }
    if (!Array.isArray(urls)) continue;
    for (const url of urls) {
      if (typeof url !== "string" || !url.startsWith("/uploads/")) continue;
      const basename = path.basename(url);
      if (!isStoredUploadName(basename)) continue;
      const filePath = path.join(UPLOADS_DIR, basename);
      try {
        unlinkSync(filePath);
        unlinked++;
      } catch (err) {
        if (err.code === "ENOENT") continue; // already gone — not an error
        unlinkErrors++;
        console.error(`seed: failed to unlink ${filePath}: ${err.message}`);
      }
    }
  }
  client.prepare("DELETE FROM leads").run(); // FK cascade clears touchpoints
  client.prepare("DELETE FROM reps").run(); // leads first — rep_id FK requires it
  console.log(
    `seed: --reset unlinked ${unlinked} old screenshot file(s)` +
      (unlinkErrors > 0 ? ` (${unlinkErrors} unlink error(s), see above)` : "") +
      " and cleared all leads and reps.",
  );
}

// ---------- screenshot placement ----------

let nextAssetIndex = 0;
let screenshotsPlaced = 0;
/** Full paths copied this run — unlinked again if the insert transaction
 * rolls back, so a SQL failure never strands screenshot files on disk. */
const placedPaths = [];

/** Copies one bundled sample asset to a fresh /uploads/<uuid>.png file. */
function placeScreenshot() {
  const asset = SEED_ASSETS[nextAssetIndex % SEED_ASSETS.length];
  nextAssetIndex++;
  const filename = `${randomUUID()}.png`;
  const dest = path.join(UPLOADS_DIR, filename);
  copyFileSync(asset, dest);
  placedPaths.push(dest);
  screenshotsPlaced++;
  return `/uploads/${filename}`;
}

/** Copies `count` sample assets and returns their /uploads/ URLs. */
function placeScreenshots(count) {
  const urls = [];
  for (let i = 0; i < count; i++) urls.push(placeScreenshot());
  return urls;
}

// ---------- fixture construction ----------

const now = Date.now();

// Seed rep roster: created as reps-table rows before any lead.
const SEED_REPS = ["Amara", "Chidi", "Fatima", "Priya", "Lars", "Aibek"];
// mirrors src/server/rep-validation.ts repNameKey(): name.trim().toLowerCase()
function repNameKey(name) {
  return name.trim().toLowerCase();
}

const METHOD_CYCLE = ["WhatsApp", "Email", "Phone", "Other"];

const INTERESTS = [
  "Steel roofing sheets, container loads",
  "Packaged rice, bulk export",
  "Pharma-grade excipients",
  "Mobile phone accessories, wholesale",
  "Cocoa beans, FOB origin",
  "Textile machinery spares",
  "Solar panel kits, distributor terms",
  "Frozen seafood, IQF",
  "Auto lubricants, private label",
  "Construction rebar, mill certs",
];
let interestCounter = 0;
function nextInterest() {
  return INTERESTS[interestCounter++ % INTERESTS.length];
}

/** One fixture entry; defaults keep the per-lead literals below short. */
function lead(overrides) {
  return {
    interest: nextInterest(),
    note: "",
    rating: null,
    screenshotCount: 0, // how many bundled assets to copy for this lead
    touchpoints: [], // epoch-ms timestamps, each >= createdAt
    archivedAt: null,
    ...overrides,
  };
}

const fixtures = [];

// ---- Explicit SLA-state coverage (active statuses) ----
fixtures.push(
  lead({
    tag: "fresh (0 touchpoints, well within 72h)",
    country: "United States",
    contactInfo: "+1 212 555 0142",
    assignedSales: "Amara",
    followUpStatus: "Pending",
    rating: null,
    createdAt: now - 2 * HOUR,
  }),
  lead({
    tag: "due-soon (0 touchpoints, ~9h remaining)",
    country: "Nigeria",
    contactInfo: "+234 802 555 0117",
    assignedSales: "Chidi",
    followUpStatus: "In Communication",
    rating: "B",
    createdAt: now - 63 * HOUR, // deadline = createdAt+72h -> 9h remaining
    screenshotCount: 1,
  }),
  lead({
    tag: "overdue (0 touchpoints, ~28h)",
    country: "United Arab Emirates",
    contactInfo: "+971 50 555 0134",
    assignedSales: "Fatima",
    followUpStatus: "Quoted",
    rating: null,
    createdAt: now - 100 * HOUR, // deadline = createdAt+72h -> 28h overdue
  }),
  lead({
    // Sanctioned seed-only state (src/app/api/leads/[id]/touchpoints/route.ts:66-69):
    // an active-status lead sitting at the response cap is "complete" per the
    // SLA rule but the API only reaches this by auto-archiving — only a
    // direct DB write like this one can leave status active at cap.
    tag: "complete-while-active, at cap (3), status still active",
    country: "Brazil",
    contactInfo: "+55 11 98555-0102",
    assignedSales: "Priya",
    followUpStatus: "In Communication",
    rating: "A",
    createdAt: now - 400 * HOUR,
    touchpoints: [now - 380 * HOUR, now - 300 * HOUR, now - 50 * HOUR],
    screenshotCount: 1,
  }),
  lead({
    tag: "follow-up n=1 due",
    country: "Germany",
    contactInfo: "+49 30 555 0142",
    assignedSales: "Lars",
    followUpStatus: "Quoted",
    rating: "C",
    createdAt: now - 90 * HOUR,
    touchpoints: [now - 10 * HOUR], // deadline = tp+120h -> 110h remaining
  }),
  lead({
    tag: "follow-up n=1 overdue",
    country: "Kyrgyzstan",
    contactInfo: "+996 312 555 016",
    assignedSales: "Aibek",
    followUpStatus: "In Communication",
    rating: null,
    createdAt: now - 200 * HOUR,
    touchpoints: [now - 130 * HOUR], // deadline = tp+120h -> 10h overdue
  }),
  lead({
    tag: "follow-up n=2 due",
    country: "India",
    contactInfo: "+91 98555 01142",
    assignedSales: "Amara",
    followUpStatus: "In Communication",
    rating: "B",
    createdAt: now - 100 * HOUR,
    touchpoints: [now - 80 * HOUR, now - 5 * HOUR], // last tp+120h -> 115h remaining
  }),
  lead({
    tag: "follow-up n=2 overdue",
    country: "Vietnam",
    contactInfo: "+84 91 555 0142",
    assignedSales: "Chidi",
    followUpStatus: "Quoted",
    rating: null,
    createdAt: now - 250 * HOUR,
    touchpoints: [now - 200 * HOUR, now - 140 * HOUR], // last tp+120h -> 20h overdue
  }),
);

// ---- Explicit terminal statuses (clock stopped, archivedAt stamped) ----
{
  const createdAt = now - 10 * DAY;
  fixtures.push(
    lead({
      tag: "terminal: Closed Won",
      country: "Mexico",
      contactInfo: "laura.gomez@example.com",
      assignedSales: "Fatima",
      followUpStatus: "Closed Won",
      rating: "A",
      createdAt,
      touchpoints: [createdAt + 2 * HOUR],
      archivedAt: createdAt + 3 * HOUR,
      screenshotCount: 2, // "some leads may carry two"
    }),
  );
}
{
  const createdAt = now - 12 * DAY;
  fixtures.push(
    lead({
      tag: "terminal: Lost",
      country: "Kenya",
      contactInfo: "+254 712 555 016",
      assignedSales: "Priya",
      followUpStatus: "Lost",
      rating: "C",
      createdAt,
      archivedAt: createdAt + HOUR,
    }),
  );
}
{
  const createdAt = now - 14 * DAY;
  fixtures.push(
    lead({
      tag: "terminal: Archived",
      country: "Philippines",
      contactInfo: "+63 917 555 0142",
      assignedSales: "Lars",
      followUpStatus: "Archived",
      rating: null,
      createdAt,
      touchpoints: [createdAt + DAY],
      archivedAt: createdAt + 2 * DAY,
    }),
  );
}

// ---- Retention candidates (deliberately outside the dashboard window; ----
// ---- matches npm run retention's defaults: --image-days 365, ----
// ---- --delete-days 1825) ----
{
  // Image-strip candidates: archived ~400 days ago (> 365-day default),
  // still carrying real screenshot files so the strip step has something to
  // observe.
  const createdAt1 = now - 405 * DAY;
  const createdAt2 = now - 402 * DAY;
  fixtures.push(
    lead({
      tag: "retention: image-strip candidate 1 (~400d archived)",
      country: "Saudi Arabia",
      contactInfo: "+966 50 555 0142",
      assignedSales: "Aibek",
      followUpStatus: "Lost",
      rating: "B",
      createdAt: createdAt1,
      archivedAt: now - 400 * DAY,
      screenshotCount: 1,
    }),
    lead({
      tag: "retention: image-strip candidate 2 (~400d archived)",
      country: "Indonesia",
      contactInfo: "+62 812 555 0142",
      assignedSales: "Amara",
      followUpStatus: "Archived",
      rating: null,
      createdAt: createdAt2,
      touchpoints: [createdAt2 + DAY],
      archivedAt: now - 400 * DAY,
      screenshotCount: 1,
    }),
  );
}
{
  // Delete candidates: archived ~1900 days ago (> 1825-day default). One
  // carries a touchpoint (cascade-delete is observable), one carries a
  // screenshot.
  const createdAt1 = now - 1905 * DAY;
  const createdAt2 = now - 1902 * DAY;
  fixtures.push(
    lead({
      tag: "retention: delete candidate 1 (~1900d archived, has touchpoint+screenshot)",
      country: "Argentina",
      contactInfo: "+54 11 5555-0142",
      assignedSales: "Chidi",
      followUpStatus: "Closed Won",
      rating: "A",
      createdAt: createdAt1,
      touchpoints: [createdAt1 + 2 * DAY],
      archivedAt: now - 1900 * DAY,
      screenshotCount: 1,
    }),
    lead({
      tag: "retention: delete candidate 2 (~1900d archived)",
      country: "Poland",
      contactInfo: "+48 500 555 016",
      assignedSales: "Fatima",
      followUpStatus: "Lost",
      rating: "C",
      createdAt: createdAt2,
      archivedAt: now - 1900 * DAY,
    }),
  );
}

// ---- Bulk filler: volume + freshness (majority within the last ~30 days) --
// ---- so the default dashboard window looks alive out of the box, plus ----
// ---- broad international/country variety. Each entry gets its own ----
// ---- country + dial code, one-to-one, distinct from every explicit lead ----
// ---- above. ----
const BULK_COUNTRY_DIALS = [
  ["Ghana", "233"],
  ["Peru", "51"],
  ["Chile", "56"],
  ["Thailand", "66"],
  ["Pakistan", "92"],
  ["Bangladesh", "880"],
  ["Colombia", "57"],
  ["Morocco", "212"],
  ["South Africa", "27"],
  ["Turkey", "90"],
  ["Egypt", "20"],
  ["Sri Lanka", "94"],
  ["Malaysia", "60"],
  ["Ukraine", "380"],
  ["Spain", "34"],
  ["Italy", "39"],
  ["Canada", "1"],
  ["Netherlands", "31"],
  ["Sweden", "46"],
  ["Zambia", "260"],
  ["Uzbekistan", "998"],
  ["Ecuador", "593"],
  ["Jordan", "962"],
  ["Tanzania", "255"],
  ["Cambodia", "855"],
];
const RATINGS = ["A", "B", "C", null];
const EMAIL_INDICES = new Set([2, 9, 15, 22]); // "a few name@example.com emails"
const WA_SUFFIX_INDICES = new Set([5, 19]); // "a couple of | wa pipe-suffixed contacts"

function bulkContact(i, dial, country) {
  if (EMAIL_INDICES.has(i)) return `buyer${i}@example.com`;
  let base;
  if (country === "Canada") {
    // NANP: apply the same reserved 555-01xx hygiene as the US fixture.
    base = `+1 416 555 01${String(50 + i).padStart(2, "0")}`;
  } else {
    const area = String(20 + (i % 70)).padStart(2, "0");
    const suffix = String(100 + i).padStart(4, "0");
    base = `+${dial} ${area} 555 ${suffix}`;
  }
  return WA_SUFFIX_INDICES.has(i) ? `${base} | wa` : base;
}

// Literal bulk plan: 25 entries, terminal at i∈{5,11,17,23},
// 21 active entries now-anchored so the default dashboard looks alive.
// tps = touchpoint offsets in HOURS BEFORE now (each is >= its lead's createdAt
// by construction). day = createdAt offset in DAYS before now; jitterH extra hours.
const BULK_PLAN = [
  { kind: "overdue",  day: 7,  jitterH: 0, tps: [130],          status: "In Communication" }, // 0
  { kind: "dueSoon",  day: 6,  jitterH: 0, tps: [112],          status: "In Communication" }, // 1
  { kind: "complete", day: 10, jitterH: 0, tps: [200, 150, 100], status: "Quoted" },           // 2
  { kind: "fresh",    day: 1,  jitterH: 0, tps: [],             status: "Pending" },           // 3
  { kind: "tp1",      day: 3,  jitterH: 0, tps: [30],           status: "In Communication" }, // 4
  { kind: "terminal", day: 9,  jitterH: 0, tps: [],             status: "Closed Won" },        // 5
  { kind: "overdue",  day: 15, jitterH: 0, tps: [130],          status: "Quoted" },            // 6
  { kind: "dueSoon",  day: 13, jitterH: 0, tps: [112],          status: "In Communication" }, // 7
  { kind: "complete", day: 17, jitterH: 0, tps: [200, 150, 100], status: "In Communication" },// 8
  { kind: "fresh",    day: 1,  jitterH: 3, tps: [],             status: "Pending" },           // 9
  { kind: "tp1",      day: 8,  jitterH: 0, tps: [30],           status: "Quoted" },            // 10
  { kind: "terminal", day: 14, jitterH: 0, tps: [],             status: "Lost" },              // 11
  { kind: "overdue",  day: 22, jitterH: 0, tps: [130],          status: "In Communication" }, // 12
  { kind: "dueSoon",  day: 20, jitterH: 0, tps: [112],          status: "Quoted" },            // 13
  { kind: "complete", day: 24, jitterH: 0, tps: [200, 150, 100], status: "In Communication" },// 14
  { kind: "fresh",    day: 2,  jitterH: 6, tps: [],             status: "Pending" },           // 15
  { kind: "tp1",      day: 12, jitterH: 0, tps: [30],           status: "In Communication" }, // 16
  { kind: "terminal", day: 21, jitterH: 0, tps: [],             status: "Archived" },          // 17
  { kind: "dueSoon",  day: 27, jitterH: 0, tps: [112],          status: "In Communication" }, // 18
  { kind: "fresh",    day: 2,  jitterH: 0, tps: [],             status: "Pending" },           // 19
  { kind: "tp1",      day: 18, jitterH: 0, tps: [30],           status: "Quoted" },            // 20
  { kind: "fresh",    day: 1,  jitterH: 3, tps: [],             status: "Pending" },           // 21
  { kind: "tp1",      day: 25, jitterH: 0, tps: [30],           status: "In Communication" }, // 22
  { kind: "terminal", day: 26, jitterH: 0, tps: [],             status: "Closed Won" },        // 23
  { kind: "tp1",      day: 28, jitterH: 0, tps: [30],           status: "Quoted" },            // 24
];

for (let i = 0; i < BULK_COUNTRY_DIALS.length; i++) {
  const [country, dial] = BULK_COUNTRY_DIALS[i];
  const p = BULK_PLAN[i];
  const createdAt = now - p.day * DAY - p.jitterH * HOUR;
  let touchpoints;
  let archivedAt;
  if (p.kind === "terminal") {
    // Terminal: createdAt-anchored tp + archivedAt stamp, clock already stopped.
    touchpoints = [createdAt + 2 * HOUR];
    archivedAt = createdAt + 3 * HOUR;
  } else {
    // Active: touchpoints anchored to `now` (hours before now).
    touchpoints = p.tps.map((h) => now - h * HOUR);
    archivedAt = null;
  }
  fixtures.push(
    lead({
      tag: `bulk ${p.kind} ${i}`,
      country,
      contactInfo: bulkContact(i, dial, country),
      assignedSales: SEED_REPS[i % SEED_REPS.length],
      followUpStatus: p.status,
      rating: RATINGS[i % RATINGS.length],
      createdAt,
      touchpoints,
      archivedAt,
    }),
  );
}

// Uniqueness guard: leads_contact_key_unique means every fixture's contact
// key must be distinct, or the insert transaction fails partway through.
{
  const keys = new Set();
  for (const f of fixtures) {
    const key = normalizeContactKey(f.contactInfo);
    if (keys.has(key)) {
      throw new Error(`seed: duplicate contactKey in fixture data: ${key}`);
    }
    keys.add(key);
  }
}

// ---------- insertion ----------

function insertFixtures(client) {
  mkdirSync(UPLOADS_DIR, { recursive: true });

  const insertRep = client.prepare(
    "INSERT INTO reps (id, name, name_key, active, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertLead = client.prepare(`
    INSERT INTO leads
      (id, created_at, country, contact_info, contact_key, rep_id,
       interest, note, screenshot_urls, follow_up_status, rating, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTouchpoint = client.prepare(`
    INSERT INTO touchpoints (id, lead_id, timestamp, method, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seedTx = client.transaction((rows) => {
    const repIds = new Map();
    for (const name of SEED_REPS) {
      const id = randomUUID();
      repIds.set(name, id);
      insertRep.run(id, name, repNameKey(name), 1, now);
    }

    for (const r of rows) {
      // Screenshots are copied inside the same synchronous transaction
      // callback the fixtures are inserted in — better-sqlite3 transactions
      // must stay synchronous, and copyFileSync is synchronous, so this is
      // safe. Only actually-copied files are ever referenced (honesty rule).
      const screenshotUrls = placeScreenshots(r.screenshotCount);

      const id = randomUUID();
      r.id = id; // stash for the summary computation below
      insertLead.run(
        id,
        Math.round(r.createdAt),
        r.country,
        r.contactInfo,
        normalizeContactKey(r.contactInfo),
        repIds.get(r.assignedSales),
        r.interest,
        r.note,
        JSON.stringify(screenshotUrls),
        r.followUpStatus,
        r.rating,
        r.archivedAt === null ? null : Math.round(r.archivedAt),
      );
      r.touchpoints.forEach((ts, idx) => {
        insertTouchpoint.run(
          randomUUID(),
          id,
          Math.round(ts),
          METHOD_CYCLE[idx % METHOD_CYCLE.length],
          "",
        );
      });
    }
  });
  try {
    seedTx(fixtures);
  } catch (err) {
    // The transaction rolled back: remove the files it copied so the
    // filesystem matches the (unchanged) database.
    let cleaned = 0;
    for (const p of placedPaths) {
      try {
        unlinkSync(p);
        cleaned++;
      } catch {
        /* best effort — a leftover file is reported, not fatal */
      }
    }
    console.error(
      `seed: insert failed and rolled back; removed ${cleaned}/${placedPaths.length} copied screenshot file(s).`,
    );
    throw err;
  }
}

// ---------- honest summary (derived from the fixtures actually inserted) ---

function printSummary() {
  console.log("");
  console.log("=== HiroCRM demo seed ===");
  console.log(`  total leads inserted: ${fixtures.length}`);
  console.log("");
  console.log("-- by status --");
  for (const status of ALL_STATUSES) {
    const count = fixtures.filter((f) => f.followUpStatus === status).length;
    console.log(`  ${status.padEnd(20)}${count}`);
  }
  console.log("");
  console.log("-- SLA state (computed at time of printing, default 72h/120h/cap 3) --");
  const stateCounts = { due: 0, overdue: 0, complete: 0, terminal: 0 };
  for (const f of fixtures) {
    const touchpointCount = f.touchpoints.length;
    const lastTouchpointAt = touchpointCount ? Math.max(...f.touchpoints) : null;
    const state = getSlaState(
      {
        createdAt: f.createdAt,
        touchpointCount,
        lastTouchpointAt,
        status: f.followUpStatus,
      },
      Date.now(),
    );
    stateCounts[state.kind]++;
  }
  console.log(`  due (incl. fresh/due-soon)  ${stateCounts.due}`);
  console.log(`  overdue                     ${stateCounts.overdue}`);
  console.log(`  complete (at/over cap)      ${stateCounts.complete}`);
  console.log(`  terminal (clock stopped)    ${stateCounts.terminal}`);
  console.log("");
  console.log(`  screenshots placed: ${screenshotsPlaced}`);
  console.log("");
  console.log(
    "seed: set ADMIN_USER / ADMIN_PASS / NEXTAUTH_SECRET in .env, then run `npm run dev`.",
  );
}

// ---------- main ----------

function main() {
  const reset = process.argv.includes("--reset");
  const client = openDb();
  try {
    // Reps count too: a reps-only database (zero leads) still collides with
    // the fixture roster, so the refuse/reset decision considers both.
    const leadCount = client.prepare("SELECT count(*) AS n FROM leads").get().n;
    const repCount = client.prepare("SELECT count(*) AS n FROM reps").get().n;
    if ((leadCount > 0 || repCount > 0) && !reset) {
      console.error(
        `seed: database already has ${leadCount} lead(s) and ${repCount} rep(s) — ` +
          "rerun with `npm run seed -- --reset` to wipe and reseed.",
      );
      process.exit(1);
    }
    // --reset always runs the reset, independent of current counts, so a
    // reps-only or partially seeded database resets identically to a full one.
    if (reset) {
      resetExistingData(client);
    }
    console.log(`seed: inserting ${fixtures.length} demo leads …`);
    insertFixtures(client);
    printSummary();
  } finally {
    client.close();
  }
}

main();
