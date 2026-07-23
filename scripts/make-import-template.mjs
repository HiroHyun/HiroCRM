// Generates the committed import template: a
// header-only .xlsx served statically from public/. Run once, not at runtime.
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const HEADERS = [
  "Contact",
  "Country",
  "Interest",
  "Assigned To",
  "Note",
  "Status",
  "Rating",
  "Created At",
];

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "public", "import-template.xlsx");

const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Leads");
XLSX.writeFile(wb, OUT);
console.log(`wrote ${OUT}`);
