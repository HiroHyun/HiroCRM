import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getDb } from "../../../../db";
import { reps } from "../../../../db/schema";
import type {
  ImportFailedRow,
  ImportResponse,
} from "../../../../lib/api-types";
import { detectCountry, normalizeContactKey } from "../../../../lib/contact";
import { normalizeRating } from "../../../../lib/rating";
import {
  canonicalizeStatus,
  type FollowUpStatus,
} from "../../../../lib/status";
import { requireSession } from "../../../../server/auth";
import { checkContentLength, jsonError } from "../../../../server/http";
import {
  FIELD_LIMITS,
  insertLead,
  isUniqueViolation,
  type ParsedLeadWrite,
} from "../../../../server/lead-validation";
import { findRepByNameKey, repNameKey } from "../../../../server/rep-validation";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CONTENT_LENGTH_SLACK,
} from "../../../../server/uploads";

// Template headers, matched trim + case-insensitive.
const HEADERS = {
  contact: "contact",
  country: "country",
  interest: "interest",
  assignedTo: "assigned to",
  note: "note",
  status: "status",
  rating: "rating",
  createdAt: "created at",
} as const;

function cellFor(row: Record<string, unknown>, header: string): unknown {
  for (const [key, value] of Object.entries(row)) {
    if (key.trim().toLowerCase() === header) return value;
  }
  return undefined;
}

/** Cell → trimmed text; numbers stringified (phone typed as a number cell). */
function cellText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return "";
  return String(value).trim();
}

/** Parsed row, minus repId: the rep isn't resolved (looked up/created) until
 * the row also clears in-file dedup, so parsing carries the raw name. */
type ParsedImportLead = Omit<ParsedLeadWrite, "repId"> & { assignedTo: string };

type RowOutcome =
  | { kind: "lead"; lead: ParsedImportLead; createdAt: Date | null }
  | { kind: "failed"; reason: string };

function parseImportRow(row: Record<string, unknown>): RowOutcome {
  const contact = cellText(cellFor(row, HEADERS.contact));
  if (contact === "") return { kind: "failed", reason: "missing_contact" };

  const assignedTo = cellText(cellFor(row, HEADERS.assignedTo));
  if (assignedTo === "") {
    return { kind: "failed", reason: "missing_rep" };
  }

  // Same field ceilings as the POST/PATCH paths (FIELD_LIMITS), applied
  // before any cell value reaches normalization, phone parsing, or the DB.
  if (
    contact.length > FIELD_LIMITS.contactInfo ||
    assignedTo.length > FIELD_LIMITS.repName ||
    cellText(cellFor(row, HEADERS.country)).length > FIELD_LIMITS.country ||
    cellText(cellFor(row, HEADERS.interest)).length > FIELD_LIMITS.interest ||
    cellText(cellFor(row, HEADERS.note)).length > FIELD_LIMITS.note
  ) {
    return { kind: "failed", reason: "field_too_long" };
  }

  // Blank → Pending (empty cells never reach canonicalizeStatus); only a
  // non-blank string that fails to canonicalize fails the row.
  const statusText = cellText(cellFor(row, HEADERS.status));
  let followUpStatus: FollowUpStatus = "Pending";
  if (statusText !== "") {
    const canonical = canonicalizeStatus(statusText);
    if (canonical === null) return { kind: "failed", reason: "invalid_status" };
    followUpStatus = canonical;
  }

  // Optional Created At: a real date cell or a parseable string; anything
  // else (incl. a General-format numeric serial) fails honestly.
  const createdCell = cellFor(row, HEADERS.createdAt);
  let createdAt: Date | null = null;
  if (createdCell !== undefined && createdCell !== null && createdCell !== "") {
    if (createdCell instanceof Date) {
      createdAt = createdCell;
    } else if (typeof createdCell === "string" && createdCell.trim() !== "") {
      createdAt = new Date(createdCell.trim());
    } else {
      return { kind: "failed", reason: "unrecognized_date" };
    }
    if (Number.isNaN(createdAt.getTime())) {
      return { kind: "failed", reason: "unrecognized_date" };
    }
  }

  // Explicit Country wins; blank auto-detects from the contact, same logic
  // as the add dialog.
  const countryText = cellText(cellFor(row, HEADERS.country));
  const country = countryText !== "" ? countryText : (detectCountry(contact) ?? "");

  const contactKey = normalizeContactKey(contact);
  if (contactKey === null) return { kind: "failed", reason: "invalid_contact" };

  return {
    kind: "lead",
    createdAt,
    lead: {
      contactInfo: contact,
      contactKey,
      country,
      assignedTo,
      interest: cellText(cellFor(row, HEADERS.interest)),
      note: cellText(cellFor(row, HEADERS.note)),
      screenshotUrls: [],
      followUpStatus,
      rating: normalizeRating(cellText(cellFor(row, HEADERS.rating))),
    },
  };
}

/**
 * Resolve (or auto-create) the rep for an Assigned To name, inside the
 * caller's per-row transaction. repMap caches committed reps by nameKey for
 * the life of one request, so a name repeated across many rows is looked
 * up/created exactly once. The caller updates repMap/createdReps only after
 * its transaction commits — a rep inserted here and then rolled back (row
 * turned out to be a duplicate) leaves no trace in the DB or the caches.
 */
function resolveRep(
  name: string,
  repMap: Map<string, { id: string; name: string }>,
): { id: string; name: string; created: boolean } {
  const nameKey = repNameKey(name);
  const cached = repMap.get(nameKey);
  if (cached) return { ...cached, created: false };

  const existing = findRepByNameKey(nameKey);
  if (existing) {
    return { id: existing.id, name: existing.name, created: false };
  }

  try {
    const values: typeof reps.$inferInsert = { name, nameKey };
    const rep = getDb().insert(reps).values(values).returning().get();
    return { id: rep.id, name: rep.name, created: true };
  } catch (err) {
    // Concurrent-request race backstop: another request created this exact
    // nameKey between our lookup and our insert.
    if (isUniqueViolation(err)) {
      const dup = findRepByNameKey(nameKey);
      if (dup) return { id: dup.id, name: dup.name, created: false };
    }
    throw err;
  }
}

/** Sentinel thrown inside a row's transaction to roll it back (duplicate
 * contact): the lead insert is skipped AND any rep created for the row is
 * undone in the same rollback. */
class DuplicateRowRollback extends Error {}

/**
 * xlsx import: per-row validation through the same domain modules
 * and shared insertLead as POST/PATCH, rows independent (a failed row never
 * rolls back its neighbors), honest actual counts.
 */
/**
 * Parse bounds for the uploaded workbook. sheet_to_json materializes the
 * sheet's full DECLARED range, so the range is validated before conversion:
 * a small file claiming `A1:XFD100000` never reaches the expansion. Rows
 * comfortably above any real import; columns leave room for stray extras
 * around the 8-column template.
 */
const MAX_IMPORT_ROWS = 5000; // data rows, excluding the header row
const MAX_IMPORT_COLS = 64;

export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  // Same request budget as the upload route: Content-Length required and
  // capped before the body is buffered, exactly one "file" part.
  const tooLarge = checkContentLength(req, MAX_UPLOAD_BYTES + UPLOAD_CONTENT_LENGTH_SLACK);
  if (tooLarge) return tooLarge;

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

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      cellDates: true,
    });
  } catch {
    return jsonError(400, "invalid_file");
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return jsonError(400, "invalid_file");

  // Declared-range guard, before any expansion happens.
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const declaredRows = range.e.r - range.s.r + 1;
    const declaredCols = range.e.c - range.s.c + 1;
    if (declaredRows > MAX_IMPORT_ROWS + 1 || declaredCols > MAX_IMPORT_COLS) {
      return jsonError(400, "file_too_large");
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  let imported = 0;
  let skippedDuplicates = 0;
  const failed: ImportFailedRow[] = [];
  const insertedKeys = new Set<string>();
  const repMap = new Map<string, { id: string; name: string }>();
  const createdReps: string[] = [];

  rows.forEach((row, index) => {
    // sheet_to_json skips blank rows, so array index drifts; __rowNum__ is
    // the real 0-based sheet row (header = 0 → spreadsheet row 1).
    const sheetRow = (row as { __rowNum__?: number }).__rowNum__ ?? index + 1;
    const rowNum = sheetRow + 1;

    try {
      const outcome = parseImportRow(row);
      if (outcome.kind === "failed") {
        failed.push({ row: rowNum, reason: outcome.reason });
        return;
      }
      // In-file dedup against rows already inserted, then the DB pre-check +
      // unique-index backstop inside insertLead.
      if (insertedKeys.has(outcome.lead.contactKey)) {
        skippedDuplicates++;
        return;
      }

      // Rep resolution (lookup/auto-create) and the lead insert run in ONE
      // per-row transaction: a row that turns out to be a DB duplicate (or
      // throws) rolls back its own rep creation, so a skipped duplicate
      // never leaves an unused rep behind. Rows stay independent — a failed
      // row never rolls back its neighbors.
      const rep = getDb().transaction(() => {
        const resolved = resolveRep(outcome.lead.assignedTo, repMap);
        const lead: ParsedLeadWrite = {
          contactInfo: outcome.lead.contactInfo,
          contactKey: outcome.lead.contactKey,
          country: outcome.lead.country,
          repId: resolved.id,
          interest: outcome.lead.interest,
          note: outcome.lead.note,
          screenshotUrls: outcome.lead.screenshotUrls,
          followUpStatus: outcome.lead.followUpStatus,
          rating: outcome.lead.rating,
        };
        const result = insertLead(lead, outcome.createdAt);
        if (!result.ok) throw new DuplicateRowRollback();
        return resolved;
      });
      // Commit landed: only now do the request-lifetime caches learn about
      // the rep, and only a genuinely created rep is reported.
      repMap.set(repNameKey(outcome.lead.assignedTo), {
        id: rep.id,
        name: rep.name,
      });
      if (rep.created) createdReps.push(rep.name);
      insertedKeys.add(outcome.lead.contactKey);
      imported++;
    } catch (err) {
      if (err instanceof DuplicateRowRollback) {
        skippedDuplicates++;
        return;
      }
      console.error(`import row ${rowNum} failed:`, err);
      failed.push({ row: rowNum, reason: "row_failed" });
    }
  });

  const payload: ImportResponse = {
    imported,
    skippedDuplicates,
    failed,
    createdReps,
  };
  return NextResponse.json(payload);
}
