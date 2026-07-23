// API smoke suite: boots a dev server against a
// scratch DB and exercises every named regression from the predecessor's
// audit. Node builtins + the repo's own xlsx dep only.
//
// Isolation model: the repository's own dev.db and data/uploads are NEVER
// touched or moved. The spawned server gets HIROCRM_DATA_DIR (the internal
// test hook in src/db/db-path.ts and src/server/upload-storage.ts) pointed
// at a fresh temp folder, so dev.db and data/uploads land there while the
// app's own first-run auto-init migrates the scratch DB — exactly the
// first-run path users get. The repo DB trio is stat-snapshotted before and
// asserted unchanged after; the suite fails loudly if the server ever wrote
// to the repository.
//
// Lifecycle (Windows-safe): make scratch dir → spawn `next dev` via
// process.execPath (spawning "npx" fails with EINVAL on Node >= 20/Windows)
// → run assertions → taskkill the process TREE (next dev forks a child that
// holds the port and the DB handle) → remove the scratch dir (retried —
// Windows releases file locks lazily).

import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const ROOT = process.cwd();
const PORT = 3987;
const BASE = `http://localhost:${PORT}`;
const SCRATCH = path.join(
  os.tmpdir(),
  `hirocrm-smoke-${randomBytes(4).toString("hex")}`,
);
const REPO_DB_FILES = ["dev.db", "dev.db-wal", "dev.db-shm"].map((f) =>
  path.join(ROOT, f),
);
const UPLOADS_DIR = path.join(SCRATCH, "data", "uploads");

const ADMIN_USER = "smoke-admin";
const ADMIN_PASS = `smoke-${randomBytes(8).toString("hex")}`;
// Explicit env wins over .env in Next; SLA values pinned so the
// hand-computed fixtures below can never drift with local overrides.
const CHILD_ENV = {
  ...process.env,
  ADMIN_USER,
  ADMIN_PASS,
  NEXTAUTH_SECRET: randomBytes(32).toString("base64"),
  NEXTAUTH_URL: BASE,
  SLA_FIRST_RESPONSE_HOURS: "72",
  SLA_FOLLOW_UP_HOURS: "120",
  SLA_RESPONSE_CAP: "3",
  // The isolation switch: all data writes land in the scratch dir.
  HIROCRM_DATA_DIR: SCRATCH,
};

const HOUR = 3_600_000;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const IMPORT_HEADER = [
  "Contact",
  "Country",
  "Interest",
  "Assigned To",
  "Note",
  "Status",
  "Rating",
  "Created At",
];

// ---------- infrastructure ----------

let server = null;
let serverLog = "";
const uploadedNames = [];
const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err?.message ?? err}`);
  }
}

async function setupScratch() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

async function removeScratch() {
  // Windows can hold file locks briefly after taskkill; retry the removal.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await rm(SCRATCH, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  console.error(`smoke: could not remove scratch dir ${SCRATCH} — remove it manually.`);
}

/** size+mtime fingerprint of the repo DB trio (null for a missing file). */
function repoDbSnapshot() {
  return REPO_DB_FILES.map((f) => {
    if (!existsSync(f)) return null;
    const s = statSync(f);
    return `${s.size}:${s.mtimeMs}`;
  });
}

function startServer() {
  server = spawn(
    process.execPath,
    [
      path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--port",
      String(PORT),
    ],
    // cwd stays the repo (next needs its project root); HIROCRM_DATA_DIR in
    // CHILD_ENV redirects every data write into the scratch dir. detached
    // makes the child a process-group leader on POSIX so stopServer() can
    // signal the group — next dev's fork does not die with its parent.
    {
      cwd: ROOT,
      env: CHILD_ENV,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
}

async function waitForServer(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited early (${server.exitCode})\n${serverLog}`);
    }
    try {
      const res = await fetch(`${BASE}/api/auth/csrf`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`dev server not ready after ${timeoutMs}ms\n${serverLog}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((r) => server.once("exit", r));
  if (process.platform === "win32") {
    // next dev forks the real server; kill the whole tree or the fork keeps
    // the port and the better-sqlite3 handle on dev.db.
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    // Same reason as the taskkill above: signal the whole group, or the fork
    // outlives us holding the inherited stdio pipes, and this process never
    // exits. Negative pid = the process group led by the detached child.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  }
  await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  // Drop our ends of the pipes so no lingering handle keeps the loop alive.
  server.stdout?.destroy();
  server.stderr?.destroy();
  await new Promise((r) => setTimeout(r, 500)); // let file handles settle
}

// Upload files live inside the scratch dir; removeScratch() sweeps them.

// ---------- HTTP helpers ----------

const jar = new Map();

function storeCookies(res) {
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(";", 1)[0];
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function api(pathname, opts = {}) {
  const { method = "GET", json, form, rawBody, headers = {}, authed = true } = opts;
  const h = { ...headers };
  if (authed && jar.size > 0) {
    h.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  let body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
  } else if (rawBody !== undefined) {
    body = rawBody;
  }
  const res = await fetch(BASE + pathname, {
    method,
    headers: h,
    body,
    redirect: "manual",
  });
  storeCookies(res);
  return res;
}

async function login() {
  const csrfRes = await api("/api/auth/csrf");
  assert(csrfRes.ok, `csrf endpoint returned ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();
  const res = await api("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    rawBody: new URLSearchParams({
      csrfToken,
      username: ADMIN_USER,
      password: ADMIN_PASS,
      callbackUrl: BASE,
      json: "true",
    }).toString(),
  });
  const hasSession = [...jar.keys()].some((k) =>
    k.includes("next-auth.session-token"),
  );
  if (!hasSession) {
    throw new Error(
      `login failed (status ${res.status}); cookies: [${[...jar.keys()].join(", ")}]`,
    );
  }
}

function importForm(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true });
  const fd = new FormData();
  fd.set(
    "file",
    new File([buf], "import.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return fd;
}

function uploadForm(bytes, filename, mime) {
  const fd = new FormData();
  fd.set("file", new File([bytes], filename, { type: mime }));
  return fd;
}

const repIdCache = new Map(); // lowercased name -> rep id

async function ensureRep(name) {
  const key = name.trim().toLowerCase();
  const cached = repIdCache.get(key);
  if (cached) return cached;
  const roster = await (await api("/api/reps")).json();
  const found = roster.reps.find((r) => r.name.trim().toLowerCase() === key);
  if (found) {
    repIdCache.set(key, found.id);
    return found.id;
  }
  const res = await api("/api/reps", { method: "POST", json: { name } });
  assertEq(res.status, 201, `ensureRep create ${name}`);
  const rep = await res.json();
  repIdCache.set(key, rep.id);
  return rep.id;
}

async function createLead(fields) {
  const { repName, repId, ...rest } = fields;
  const resolvedRepId = repId ?? (await ensureRep(repName ?? "Bob"));
  const res = await api("/api/leads", { method: "POST", json: { ...rest, repId: resolvedRepId } });
  assertEq(res.status, 201, `create lead ${JSON.stringify(fields.contactInfo)}`);
  return res.json();
}

async function getLead(id) {
  const res = await api(`/api/leads/${id}`);
  assertEq(res.status, 200, `get lead ${id}`);
  return res.json();
}

async function addTouchpoint(leadId, method = "WhatsApp") {
  const res = await api(`/api/leads/${leadId}/touchpoints`, {
    method: "POST",
    json: { method, notes: "smoke" },
  });
  assertEq(res.status, 201, `add touchpoint to ${leadId}`);
  return res.json();
}

// ---------- the suite ----------

async function runSuite() {
  let smokeRep = null;

  await check("unauthenticated request → 401", async () => {
    const res = await api("/api/leads", { authed: false });
    assertEq(res.status, 401, "status");
  });

  await login();
  console.log("smoke: logged in");

  await check("one-row import → imported: 1 (+ country auto-detect)", async () => {
    const res = await api("/api/leads/import", {
      method: "POST",
      form: importForm([
        IMPORT_HEADER,
        ["+996 555 111 222", "", "widgets", "Aidai", "", "", "", ""],
      ]),
    });
    assertEq(res.status, 200, "status");
    const body = await res.json();
    assertEq(body.imported, 1, "imported");
    assertEq(body.skippedDuplicates, 0, "skippedDuplicates");
    assertEq(body.failed.length, 0, "failed rows");
    assertEq(JSON.stringify(body.createdReps), JSON.stringify(["Aidai"]), "createdReps == [Aidai]");
    // Owner ruling: blank Country auto-detects from the contact.
    const list = await (
      await api(`/api/leads?search=${encodeURIComponent("996 555 111")}`)
    ).json();
    assertEq(list.leads.length, 1, "imported lead findable");
    assertEq(list.leads[0].country, "Kyrgyzstan", "auto-detected country");
  });

  await check("import: per-row failures honest, real row numbers", async () => {
    const res = await api("/api/leads/import", {
      method: "POST",
      form: importForm([
        IMPORT_HEADER,
        ["+81 90 1234 5678", "", "", "Kenji", "", "closed won", "b", ""], // row 2: ok, canonicalized status+rating
        ["+33 6 12 34 56 78", "", "", "Marie", "", "Nonsense", "", ""], // row 3: bad status
        ["+34 612 345 678", "", "", "Sofia", "", "", "", "not a date"], // row 4: bad date
        ["", "", "", "Nobody", "", "", "", ""], // row 5: missing contact
      ]),
    });
    assertEq(res.status, 200, "status");
    const body = await res.json();
    assertEq(body.imported, 1, "imported");
    assertEq(body.failed.length, 3, "failed count");
    const byRow = Object.fromEntries(body.failed.map((f) => [f.row, f.reason]));
    assertEq(byRow[3], "invalid_status", "row 3 reason");
    assertEq(byRow[4], "unrecognized_date", "row 4 reason");
    assertEq(byRow[5], "missing_contact", "row 5 reason");
    // canonicalized terminal status stamped archivedAt at birth
    const list = await (
      await api(`/api/leads?search=${encodeURIComponent("90 1234")}`)
    ).json();
    assertEq(list.leads[0].followUpStatus, "Closed Won", "canonicalized status");
    assertEq(list.leads[0].rating, "B", "canonicalized rating");
    assert(list.leads[0].archivedAt !== null, "terminal-at-birth archivedAt");
  });

  const leadA = await createLead({
    contactInfo: "+1 212 555 0100 | wa",
    repName: "Bob",
    interest: "gadgets",
  });

  await check("duplicate on POST → 409 + duplicateId", async () => {
    const res = await api("/api/leads", {
      method: "POST",
      json: {
        // separator/case variant — must normalize onto the same contactKey
        contactInfo: "+1(212)555-0100|WA",
        repId: await ensureRep("Eve"),
        interest: "",
      },
    });
    assertEq(res.status, 409, "status");
    const body = await res.json();
    assertEq(body.error, "duplicate", "error code");
    assertEq(body.duplicateId, leadA.id, "duplicateId");
  });

  const leadB = await createLead({
    contactInfo: "+49 30 901820",
    repName: "Eve",
    interest: "",
  });

  await check("duplicate on PATCH → 409; self-save → 200", async () => {
    const dup = await api(`/api/leads/${leadB.id}`, {
      method: "PATCH",
      json: { contactInfo: "+1 (212) 555 0100 | wa" },
    });
    assertEq(dup.status, 409, "duplicate status");
    assertEq((await dup.json()).duplicateId, leadA.id, "duplicateId");
    const self = await api(`/api/leads/${leadB.id}`, {
      method: "PATCH",
      json: { contactInfo: leadB.contactInfo },
    });
    assertEq(self.status, 200, "self-save status");
  });

  await check("duplicate on import → skippedDuplicates: 1", async () => {
    const res = await api("/api/leads/import", {
      method: "POST",
      form: importForm([
        IMPORT_HEADER,
        ["+1 212-555-0100 |wa", "", "", "Mallory", "", "", "", ""],
      ]),
    });
    const body = await res.json();
    assertEq(body.imported, 0, "imported");
    assertEq(body.skippedDuplicates, 1, "skippedDuplicates");
  });

  await check("invalid status on POST/PATCH → 400", async () => {
    const post = await api("/api/leads", {
      method: "POST",
      json: {
        contactInfo: "someone@example.com",
        repId: await ensureRep("Bob"),
        interest: "",
        followUpStatus: "Following",
      },
    });
    assertEq(post.status, 400, "POST status");
    assertEq((await post.json()).error, "invalid_status", "POST error code");
    const patch = await api(`/api/leads/${leadB.id}`, {
      method: "PATCH",
      json: { followUpStatus: "junk" },
    });
    assertEq(patch.status, 400, "PATCH status");
  });

  await check("junk rating persists as null", async () => {
    const created = await createLead({
      contactInfo: "rated@example.com",
      repName: "Bob",
      interest: "",
      rating: "great!!",
    });
    assertEq(created.rating, null, "POST junk rating");
    const patched = await api(`/api/leads/${created.id}`, {
      method: "PATCH",
      json: { rating: "b" },
    });
    assertEq((await patched.json()).rating, "B", "PATCH case-folds b → B");
    await api(`/api/leads/${created.id}`, {
      method: "PATCH",
      json: { rating: "??" },
    });
    const detail = await getLead(created.id);
    assertEq(detail.lead.rating, null, "junk rating stored null");
  });

  const leadD = await createLead({
    contactInfo: "+55 11 91234-5678",
    repName: "Bob",
    interest: "",
  });
  let thirdTouchpointId = null;

  await check("3rd touchpoint auto-archives an active lead", async () => {
    const first = await addTouchpoint(leadD.id);
    assertEq(first.autoArchived, false, "1st touchpoint");
    const second = await addTouchpoint(leadD.id);
    assertEq(second.autoArchived, false, "2nd touchpoint");
    const third = await addTouchpoint(leadD.id);
    thirdTouchpointId = third.touchpoint.id;
    assertEq(third.autoArchived, true, "3rd touchpoint autoArchived");
    assertEq(third.lead.followUpStatus, "Archived", "status");
    assert(third.lead.archivedAt !== null, "archivedAt stamped");
    const detail = await getLead(leadD.id);
    assertEq(detail.lead.followUpStatus, "Archived", "persisted status");
    assertEq(detail.lead.touchpointCount, 3, "touchpoint count");
  });

  await check("auto-archive never touches Closed Won", async () => {
    const won = await createLead({
      contactInfo: "+971 50 123 4567",
      repName: "Eve",
      interest: "",
      followUpStatus: "Closed Won",
    });
    assert(won.archivedAt !== null, "terminal at birth stamps archivedAt");
    for (let i = 0; i < 3; i++) {
      const tp = await addTouchpoint(won.id, "Phone");
      assertEq(tp.autoArchived, false, `touchpoint ${i + 1} autoArchived`);
      assertEq(tp.lead.followUpStatus, "Closed Won", `status after tp ${i + 1}`);
    }
  });

  await check("touchpoint delete reverts an auto-archive", async () => {
    const res = await api(`/api/touchpoints/${thirdTouchpointId}`, {
      method: "DELETE",
    });
    assertEq(res.status, 200, "status");
    const body = await res.json();
    assertEq(body.reverted, true, "reverted");
    assertEq(body.lead.followUpStatus, "In Communication", "revert target");
    assertEq(body.lead.archivedAt, null, "archivedAt cleared");
  });

  await check("touchpoint POST to unknown lead → 404", async () => {
    const res = await api("/api/leads/no-such-lead/touchpoints", {
      method: "POST",
      json: { method: "Email" },
    });
    assertEq(res.status, 404, "status");
  });

  await check("touchpoint DELETE unknown id → 404", async () => {
    const res = await api("/api/touchpoints/no-such-touchpoint", {
      method: "DELETE",
    });
    assertEq(res.status, 404, "status");
  });

  await check("oversized upload → 413", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    PNG_1X1.copy(big, 0);
    const res = await api("/api/upload", {
      method: "POST",
      form: uploadForm(big, "big.png", "image/png"),
    });
    assertEq(res.status, 413, "status");
  });

  await check("spoofed-MIME upload → 415", async () => {
    const jpegBytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64),
    ]);
    const res = await api("/api/upload", {
      method: "POST",
      form: uploadForm(jpegBytes, "fake.png", "image/png"),
    });
    assertEq(res.status, 415, "status");
  });

  let uploadedUrl = null;

  await check("valid PNG upload → 200 and served back", async () => {
    const res = await api("/api/upload", {
      method: "POST",
      form: uploadForm(PNG_1X1, "shot.png", "image/png"),
    });
    assertEq(res.status, 200, "upload status");
    const body = await res.json();
    assert(
      /^\/uploads\/[0-9a-f-]{36}\.png$/.test(body.url),
      `url shape: ${body.url}`,
    );
    uploadedUrl = body.url;
    const name = body.url.slice("/uploads/".length);
    uploadedNames.push(name);
    const served = await api(body.url);
    assertEq(served.status, 200, "served status");
    const servedBytes = Buffer.from(await served.arrayBuffer());
    assert(servedBytes.equals(PNG_1X1), "served bytes match uploaded PNG");
    assertEq(served.headers.get("content-type"), "image/png", "content type");
    assert(
      (served.headers.get("cache-control") ?? "").includes("no-store"),
      `cache-control includes no-store: ${served.headers.get("cache-control")}`,
    );
    assert(
      existsSync(path.join(UPLOADS_DIR, name)),
      "file exists under data/uploads/",
    );
    assert(
      !existsSync(path.join(ROOT, "public", "uploads", name)),
      "file does NOT exist under public/uploads/",
    );
  });

  await check("lead DELETE removes screenshot file from disk", async () => {
    assert(uploadedUrl !== null, "needs the upload above");
    const holder = await createLead({
      contactInfo: "screenshot-holder@example.com",
      repName: "Bob",
      interest: "",
      screenshotUrls: [uploadedUrl],
    });
    const del = await api(`/api/leads/${holder.id}`, { method: "DELETE" });
    assertEq(del.status, 200, "delete status");
    const onDisk = existsSync(
      path.join(UPLOADS_DIR, uploadedUrl.slice("/uploads/".length)),
    );
    assertEq(onDisk, false, "file unlinked after DB commit");
  });

  await check("malformed JSON → 400", async () => {
    const res = await api("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      rawBody: "{not json",
    });
    assertEq(res.status, 400, "status");
    assertEq((await res.json()).error, "invalid_json", "error code");
  });

  await check("junk query params → 200 with safe defaults", async () => {
    const res = await api(
      "/api/leads?page=abc&sort=junk&dir=sideways&from=notadate&rating=Z&view=nope",
    );
    assertEq(res.status, 200, "status");
    const body = await res.json();
    assertEq(body.page, 1, "page fell back to 1");
    assert(Array.isArray(body.leads), "leads array present");
    assert(body.kpis && typeof body.kpis.total === "number", "kpis present");
  });

  await check("overdue KPI matches hand-computed fixture", async () => {
    const now = Date.now();
    const rep = "KpiBot";
    const res = await api("/api/leads/import", {
      method: "POST",
      form: importForm([
        IMPORT_HEADER,
        // 100h old, 0 touchpoints → overdue (72h first-response window)
        ["+234 803 555 0001", "", "", rep, "", "", "", new Date(now - 100 * HOUR)],
        // 65h old, 0 touchpoints → due soon (~7h remaining)
        ["+234 803 555 0002", "", "", rep, "", "", "", new Date(now - 65 * HOUR)],
        // 500h old but terminal → clock stopped
        [
          "+234 803 555 0003",
          "",
          "",
          rep,
          "",
          "Closed Won",
          "",
          new Date(now - 500 * HOUR),
        ],
        // 200h old, gets a touchpoint now → 120h follow-up window → due
        ["+234 803 555 0004", "", "", rep, "", "", "", new Date(now - 200 * HOUR)],
      ]),
    });
    const imported = await res.json();
    assertEq(imported.imported, 4, "fixture imported");

    const kpiBotId = await ensureRep(rep);

    // Reset the 4th lead's clock with a touchpoint logged now.
    const list = await (
      await api(`/api/leads?rep=${kpiBotId}&search=${encodeURIComponent("0004")}`)
    ).json();
    assertEq(list.leads.length, 1, "fixture lead 4 findable");
    await addTouchpoint(list.leads[0].id, "Email");

    // Hand-computed: only lead 1 is breached. Rep filter isolates the
    // fixture; the All view is asserted (Active/Overdue have degenerate
    // overdue values by definition).
    const all = await (await api(`/api/leads?rep=${kpiBotId}`)).json();
    assertEq(all.kpis.total, 4, "total");
    assertEq(all.kpis.overdue, 1, "overdue");
    assertEq(
      all.kpis.active,
      3,
      "active denominator: leads 1,2,4 are active-status; lead 3 (Closed Won) is terminal",
    );
    assert(all.kpis.active >= all.kpis.overdue, "active >= overdue invariant");
    // Zero-touchpoint leads in the list guard the count(*)-on-LEFT-JOIN
    // regression, which would 500 this request.
    const zeroTp = all.leads.filter((l) => l.touchpointCount === 0).length;
    assertEq(zeroTp, 3, "zero-touchpoint rows served");
    // Only lead 2 (65h old, ~7h remaining) is due soon; lead 1 is already
    // overdue and lead 4's fresh touchpoint left it ~120h out.
    assertEq(all.kpis.dueSoon, 1, "due soon");
    const closed = await (
      await api(`/api/leads?rep=${kpiBotId}&view=closed`)
    ).json();
    assertEq(closed.kpis.total, 1, "closed view total");
    assertEq(closed.kpis.overdue, 0, "closed view overdue is 0");
    assertEq(
      closed.kpis.active,
      3,
      "closed view still reports the active denominator (view tab does not restrict it)",
    );
    // Closed view is a terminal-only dataset: dueSoon is hardcoded 0, no scan.
    assertEq(closed.kpis.dueSoon, 0, "closed view due soon is 0");
    const overdueView = await (
      await api(`/api/leads?rep=${kpiBotId}&view=overdue`)
    ).json();
    assertEq(overdueView.kpis.total, 1, "overdue view total");
    assertEq(
      overdueView.kpis.active,
      3,
      "overdue view reports the full active-status denominator",
    );
    // dueSoon is the same active-status denominator active uses, not scoped
    // to the view tab's breach filter — same value as the all-view assertion
    // above: it's a KPI-tile denominator, not a per-view breach count.
    assertEq(overdueView.kpis.dueSoon, 1, "overdue view due soon");
  });

  await check("PATCH Lost → Archived preserves archivedAt", async () => {
    const lost = await createLead({
      contactInfo: "+880 1712 345678",
      repName: "Eve",
      interest: "",
      followUpStatus: "Lost",
    });
    assert(lost.archivedAt !== null, "Lost at birth stamps archivedAt");
    await new Promise((r) => setTimeout(r, 20));
    const res = await api(`/api/leads/${lost.id}`, {
      method: "PATCH",
      json: { followUpStatus: "Archived" },
    });
    const body = await res.json();
    assertEq(body.followUpStatus, "Archived", "status changed");
    assertEq(body.archivedAt, lost.archivedAt, "retention clock untouched");
  });

  await check("lead DELETE cascades touchpoints", async () => {
    // leadD still has 2 touchpoints after the revert test.
    const detail = await getLead(leadD.id);
    assertEq(detail.touchpoints.length, 2, "precondition");
    const tpId = detail.touchpoints[0].id;
    const del = await api(`/api/leads/${leadD.id}`, { method: "DELETE" });
    assertEq(del.status, 200, "delete status");
    assertEq((await getLeadStatus(leadD.id)), 404, "lead gone");
    const tpDel = await api(`/api/touchpoints/${tpId}`, { method: "DELETE" });
    assertEq(tpDel.status, 404, "touchpoint cascaded away");
  });

  await check("POST /api/reps → 201; roster shows it, leadCount 0, active", async () => {
    const res = await api("/api/reps", { method: "POST", json: { name: "SmokeRep" } });
    assertEq(res.status, 201, "status");
    smokeRep = await res.json();
    assertEq(smokeRep.leadCount, 0, "leadCount");
    assertEq(smokeRep.active, true, "active");
    const roster = await (await api("/api/reps")).json();
    const found = roster.reps.find((r) => r.id === smokeRep.id);
    assert(found, "rep present in roster");
    assertEq(found.name, "SmokeRep", "roster name");
  });

  await check("case-variant rep create → 409 duplicate_rep + duplicateId", async () => {
    const res = await api("/api/reps", { method: "POST", json: { name: "smokerep " } });
    assertEq(res.status, 409, "status");
    const body = await res.json();
    assertEq(body.error, "duplicate_rep", "error code");
    assertEq(body.duplicateId, smokeRep.id, "duplicateId points at SmokeRep");
  });

  await check("rename rep → 200; join reflects the new name", async () => {
    const res = await api(`/api/reps/${smokeRep.id}`, {
      method: "PATCH",
      json: { name: "SmokeRepRenamed" },
    });
    assertEq(res.status, 200, "status");
    const roster = await (await api("/api/reps")).json();
    const found = roster.reps.find((r) => r.id === smokeRep.id);
    assertEq(found.name, "SmokeRepRenamed", "roster shows new name");
    await createLead({
      contactInfo: "renamed-rep@example.com",
      repId: smokeRep.id,
      interest: "",
    });
    const list = await (
      await api(`/api/leads?search=${encodeURIComponent("renamed-rep@example.com")}`)
    ).json();
    assertEq(list.leads.length, 1, "assigned lead findable");
    assertEq(list.leads[0].repName, "SmokeRepRenamed", "joined repName is the new name");
  });

  await check("merge repoints leads + deletes source (hand-counted)", async () => {
    const src = await (
      await api("/api/reps", { method: "POST", json: { name: "MergeSrc" } })
    ).json();
    const dst = await (
      await api("/api/reps", { method: "POST", json: { name: "MergeDst" } })
    ).json();
    await createLead({ contactInfo: "merge-s1@example.com", repId: src.id, interest: "" });
    await createLead({ contactInfo: "merge-s2@example.com", repId: src.id, interest: "" });
    await createLead({ contactInfo: "merge-d1@example.com", repId: dst.id, interest: "" });
    const res = await api(`/api/reps/${src.id}`, {
      method: "PATCH",
      json: { mergeIntoId: dst.id },
    });
    assertEq(res.status, 200, "merge status");
    assertEq((await res.json()).moved, 2, "moved count");
    const roster = await (await api("/api/reps")).json();
    const dstRow = roster.reps.find((r) => r.id === dst.id);
    assertEq(dstRow.leadCount, 3, "dst leadCount = 2 + 1");
    assert(!roster.reps.some((r) => r.id === src.id), "source rep gone");
    const list = await (await api(`/api/leads?rep=${dst.id}`)).json();
    assertEq(list.kpis.total, 3, "dst now owns 3 leads");
  });

  await check("delete zero-lead rep → 200; gone from roster", async () => {
    const rep = await (
      await api("/api/reps", { method: "POST", json: { name: "DeleteMe" } })
    ).json();
    const del = await api(`/api/reps/${rep.id}`, { method: "DELETE" });
    assertEq(del.status, 200, "status");
    const roster = await (await api("/api/reps")).json();
    assert(!roster.reps.some((r) => r.id === rep.id), "gone from roster");
  });

  await check("delete rep with leads → 409 rep_has_leads; still in roster", async () => {
    const rep = await (
      await api("/api/reps", { method: "POST", json: { name: "HasLeads" } })
    ).json();
    await createLead({ contactInfo: "hasleads@example.com", repId: rep.id, interest: "" });
    const del = await api(`/api/reps/${rep.id}`, { method: "DELETE" });
    assertEq(del.status, 409, "status");
    assertEq((await del.json()).error, "rep_has_leads", "error code");
    const roster = await (await api("/api/reps")).json();
    assert(roster.reps.some((r) => r.id === rep.id), "still in roster");
  });

  await check("import case-variant rep names → one created rep, both joined", async () => {
    const res = await api("/api/leads/import", {
      method: "POST",
      form: importForm([
        IMPORT_HEADER,
        ["newrep-a@example.com", "", "", "NewRep", "", "", "", ""],
        ["newrep-b@example.com", "", "", "newrep ", "", "", "", ""],
      ]),
    });
    assertEq(res.status, 200, "status");
    const body = await res.json();
    assertEq(body.imported, 2, "imported 2");
    assertEq(
      JSON.stringify(body.createdReps),
      JSON.stringify(["NewRep"]),
      "createdReps is exactly [NewRep]",
    );
    const list = await (
      await api(`/api/leads?search=${encodeURIComponent("newrep-")}`)
    ).json();
    assertEq(list.leads.length, 2, "both imported rows present");
    for (const l of list.leads) {
      assertEq(l.repName, "NewRep", "both rows joined to NewRep");
    }
  });

  await check("POST lead with unknown repId → 400 unknown_rep", async () => {
    const res = await api("/api/leads", {
      method: "POST",
      json: { contactInfo: "unknown-rep@example.com", repId: randomUUID(), interest: "" },
    });
    assertEq(res.status, 400, "status");
    assertEq((await res.json()).error, "unknown_rep", "error code");
  });

  await check("logged-out GET /uploads/<name> → 401", async () => {
    assert(uploadedUrl !== null, "needs the upload check above");
    const res = await api(uploadedUrl, { authed: false });
    assertEq(res.status, 401, "status");
  });

  await check("traversal + extension guard on /uploads/<name> → 404", async () => {
    for (const p of ["/uploads/..%2Fdev.db", "/uploads/x%2Fy.png", "/uploads/evil.svg"]) {
      const res = await api(p);
      assert(res.status !== 200, `${p} returned 200`);
    }
  });

  await check("E.164 canonicalization dedups across +/00/separator forms end-to-end", async () => {
    const first = await createLead({
      contactInfo: "+1 646 555 0111 | wa",
      repName: "Bob",
      interest: "",
    });
    const res = await api("/api/leads", {
      method: "POST",
      json: {
        contactInfo: "001 (646) 555.0111 | different note",
        repId: await ensureRep("Eve"),
        interest: "",
      },
    });
    assertEq(res.status, 409, "status");
    const body = await res.json();
    assertEq(body.error, "duplicate", "error code");
    assertEq(body.duplicateId, first.id, "duplicateId");
  });

  await check("empty contact head before | → 400 invalid_contact", async () => {
    const res = await api("/api/leads", {
      method: "POST",
      json: {
        contactInfo: "| just a note",
        repId: await ensureRep("Bob"),
        interest: "",
      },
    });
    assertEq(res.status, 400, "status");
    assertEq((await res.json()).error, "invalid_contact", "error code");
  });
}

async function getLeadStatus(id) {
  return (await api(`/api/leads/${id}`)).status;
}

// ---------- main ----------

async function main() {
  // Refuse to clobber a server already on our port.
  let portBusy = false;
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    portBusy = true;
  } catch {
    /* free — good */
  }
  if (portBusy) {
    console.error(`smoke: port ${PORT} is already in use — aborting.`);
    process.exit(1);
  }

  console.log(`smoke: preparing scratch dir ${SCRATCH} …`);
  const repoDbBefore = JSON.stringify(repoDbSnapshot());
  await setupScratch();
  try {
    console.log("smoke: starting dev server (cwd = scratch) …");
    startServer();
    await waitForServer();
    console.log("smoke: server ready, running assertions");
    await runSuite();

    // Isolation proof, both directions: the server created its DB inside
    // the scratch dir, and the repository trio is exactly as it was.
    await check("smoke isolation: scratch DB used, repo DB untouched", async () => {
      assert(
        existsSync(path.join(SCRATCH, "dev.db")),
        "scratch dev.db exists (server ran against the scratch dir)",
      );
      assertEq(
        JSON.stringify(repoDbSnapshot()),
        repoDbBefore,
        "repository dev.db trio unchanged",
      );
    });
  } finally {
    await stopServer();
    await removeScratch();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nsmoke: ${passed}/${results.length} assertions passed`);
  if (passed !== results.length || results.length === 0) {
    console.error("smoke: FAILED");
    process.exit(1);
  }
  console.log("smoke OK");
}

main().catch(async (err) => {
  console.error("smoke: fatal:", err);
  try {
    await stopServer();
    await removeScratch();
  } catch (cleanupErr) {
    console.error("smoke: cleanup after fatal error also failed:", cleanupErr);
  }
  process.exit(1);
});
