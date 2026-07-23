// International contact handling, per the 2026-07-11 owner clarifications:
// dedup normalization, live country auto-detection, and render-only display
// formatting. Pure module, shared by server (contactKey, import) and client
// (live detect in the add dialog). Default libphonenumber-js import — the
// min metadata rejects every pattern-invalid fixture in the test matrix.

import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import { strings } from "./strings";

// The separators this module strips: whitespace, dashes, parentheses. "Dashes"
// includes the typographic ones (\p{Pd}: en/em/non-breaking hyphens) plus the
// U+2212 minus sign — numbers pasted from web pages and chat apps carry them,
// and a missed dash would split the dedup key for the same number.
const SEPARATORS = /[\s()\p{Pd}−]/gu;

// Key-only separators: everything SEPARATORS strips, plus the
// literal period — periods appear in dotted phone formats (+86.138.0013.8000)
// but must NOT be stripped for country detection/display, so this is a
// distinct regex rather than an extension of SEPARATORS above.
const KEY_SEPARATORS = /[\s().\p{Pd}−]/gu;

/**
 * The dedup key (canonical identity):
 * split at the first `|`, trim the head (empty → null, invalid contact);
 * classify the head as email, explicit international phone, or
 * other/invalid-phone-like input, and canonicalize accordingly. Only the
 * pre-`|` head ever contributes to identity — the suffix is display-only
 * context.
 */
export function normalizeContactKey(raw: string): string | null {
  const pipeIndex = raw.indexOf("|");
  const head = (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
  if (head === "") return null;

  // 1. Email: preserve every character but fold case.
  if (head.includes("@")) return head.toLowerCase();

  // 2. Explicit international phone.
  let candidate: string | null = null;
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

  // 3. Other or invalid phone-like input: lowercase, collapse whitespace.
  return head
    .toLowerCase()
    .replace(/\p{White_Space}+/gu, " ")
    .trim();
}

const REGION_NAMES = new Intl.DisplayNames("en", { type: "region" });

/** English CLDR name for a 2-letter region code; anything else is null. */
function regionName(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    return REGION_NAMES.of(code) ?? null;
  } catch {
    return null;
  }
}

/** US and CA share +1 and are labeled together. */
function countryLabel(code: string | undefined): string | null {
  if (code === "US" || code === "CA") return strings.contact.combinedNanp;
  return code === undefined ? null : regionName(code);
}

/**
 * Live path for explicit international input (`+…`): AsYouType resolves as
 * soon as the prefix is unambiguous — deliberately WITHOUT full validation.
 * Only explicit international input (a leading `+` or `00`) ever names a
 * country; domestic-looking digits never trigger detection.
 */
function detectFromInternational(candidate: string): string | null {
  const typer = new AsYouType();
  typer.input(candidate);
  const label = countryLabel(typer.getCountry());
  if (label !== null) return label;
  // +1 may resolve before region certainty (US vs Canada).
  return typer.getCallingCode() === "1" ? strings.contact.combinedNanp : null;
}

/**
 * Live country auto-detection. Returns the English display label
 * (auto-filled into the country field) or null. Only the part before the
 * first `|` counts; an `@` there marks an email and detection never applies;
 * separators are stripped before the prefix tests; digits without a
 * `+`/`00` prefix never auto-detect — fully-typed domestic formats collide
 * across regions, e.g. an Italian mobile reads as a valid Belgian number.
 */
export function detectCountry(raw: string): string | null {
  const head = raw.split("|", 1)[0];
  if (head.includes("@")) return null;
  const stripped = head.replace(SEPARATORS, "");
  if (stripped === "") return null;

  const plusIndex = stripped.indexOf("+");
  if (plusIndex !== -1) {
    return detectFromInternational(stripped.slice(plusIndex));
  }
  if (stripped.startsWith("00")) {
    return detectFromInternational(`+${stripped.slice(2)}`);
  }
  return null;
}

/**
 * Render-only display formatting: the pre-`|` head formats via
 * formatInternational() when it validates as an international number (`+`
 * or `00` prefix; strict parse — never extracting a number out of
 * surrounding text as if it were confidently detected). Everything else
 * renders raw. Storage always keeps the raw string.
 */
export function formatContactDisplay(raw: string): string {
  const pipeIndex = raw.indexOf("|");
  const head = (pipeIndex === -1 ? raw : raw.slice(0, pipeIndex)).trim();
  const suffix = pipeIndex === -1 ? null : raw.slice(pipeIndex + 1).trim();

  const candidate = head.startsWith("00") ? `+${head.slice(2)}` : head;
  if (!candidate.startsWith("+")) return raw;
  const parsed = parsePhoneNumberFromString(candidate, { extract: false });
  if (!parsed?.isValid()) return raw;

  const formatted = parsed.formatInternational();
  return suffix === null || suffix === ""
    ? formatted
    : `${formatted} | ${suffix}`;
}
