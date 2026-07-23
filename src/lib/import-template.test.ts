// Guards that the committed template can never drift from the import route's
// documented headers. Reads the real committed file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

const EXPECTED = [
  "Contact",
  "Country",
  "Interest",
  "Assigned To",
  "Note",
  "Status",
  "Rating",
  "Created At",
];

describe("import template", () => {
  it("ships the 8 documented headers in row 1", () => {
    const file = path.join(process.cwd(), "public", "import-template.xlsx");
    const wb = XLSX.read(readFileSync(file));
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]).toEqual(EXPECTED);
  });
});
