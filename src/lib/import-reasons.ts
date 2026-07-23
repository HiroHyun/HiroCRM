// Maps an import-route reason code (api-types ImportFailedRow.reason) to user
// copy; unknown codes fall back to a generic label so a raw code never leaks
// to the UI. Copy lives in strings.importReasons.
import { strings } from "./strings";

const REASON_LABELS: Record<string, string> = {
  missing_contact: strings.importReasons.missing_contact,
  missing_rep: strings.importReasons.missing_rep,
  invalid_contact: strings.importReasons.invalid_contact,
  invalid_status: strings.importReasons.invalid_status,
  unrecognized_date: strings.importReasons.unrecognized_date,
  field_too_long: strings.importReasons.field_too_long,
  row_failed: strings.importReasons.row_failed,
};

export function importReasonLabel(code: string): string {
  return REASON_LABELS[code] ?? strings.importReasons.unknown;
}
