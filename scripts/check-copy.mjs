// check:copy — the gate's copy and palette checks.
//
//   1. Copy scan (.tsx): JSX text-node literals and literal strings in
//      copy-bearing JSX attributes. Components hold `strings.*` expressions,
//      never literals (src/lib/strings.ts owns every user-facing string).
//   2. Palette / anti-default tripwire (.ts + .tsx): raw Tailwind palette
//      classes, colors outside globals.css, and the design language's banned
//      utilities (rounded-xl/2xl, gradients, looping animation, backdrop-blur
//      outside the sticky header, Inter/Geist).
//
// Reports file:line per violation; any violation exits 1.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

// Files whose *purpose* exempts them from one scanner.
const COPY_ALLOWLIST = new Set([
  "src/lib/strings.ts", // the copy module itself
  "src/components/wordmark.tsx", // brand glyphs ("iro"/"CRM"), not copy
]);
const BLUR_ALLOWLIST = new Set([
  "src/components/app-header.tsx", // the sticky header is the one surface allowed to use blur
]);

const PALETTE_FAMILIES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const PALETTE_PREFIXES =
  "bg|text|border|ring|fill|stroke|shadow|outline|decoration|divide|from|via|to|accent|caret|placeholder";

const TRIPWIRE = [
  {
    name: "raw Tailwind palette class",
    re: new RegExp(`\\b(?:${PALETTE_PREFIXES})-(?:${PALETTE_FAMILIES})-\\d+`, "g"),
  },
  { name: "hex color outside globals.css", re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: "oklch() outside globals.css", re: /\boklch\(/g },
  { name: "color-mix() outside globals.css", re: /\bcolor-mix\(/g },
  { name: "banned radius", re: /\brounded-(?:xl|2xl|3xl|4xl)\b/g },
  {
    name: "gradient utility",
    re: /\bbg-(?:gradient-to-|linear-|radial|conic)/g,
  },
  {
    name: "looping animation",
    re: /\banimate-(?:pulse|bounce|spin|ping)\b/g,
  },
  { name: "backdrop-blur outside the header", re: /\bbackdrop-blur/g, allow: BLUR_ALLOWLIST },
  { name: "banned font", re: /\b(?:Inter|Geist)\b/g },
];

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(entry.name)) scanFile(path);
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// Blank out comments (preserving newlines) so commented-out code can't trip.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

function scanFile(path) {
  const rel = relative(ROOT, path).replaceAll("\\", "/");
  if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return;
  const text = stripComments(readFileSync(path, "utf8"));

  // 1. Copy scan — .tsx only, JSX text nodes + copy-bearing attribute literals.
  if (rel.endsWith(".tsx") && !COPY_ALLOWLIST.has(rel)) {
    // A JSX text node ends at `</tag` or `<Child` — requiring a letter or
    // slash after the closing `<` keeps multiline type annotations
    // (`Props> &\n  Pick<...`) from matching.
    for (const m of text.matchAll(/>([^<>{}]+)<(?=[A-Za-z/])/g)) {
      const letters = m[1].search(/[A-Za-z]{2,}/);
      if (letters >= 0) {
        violations.push(
          `${rel}:${lineOf(text, m.index + 1 + letters)} hardcoded JSX text ${JSON.stringify(m[1].trim().slice(0, 40))} — copy belongs in src/lib/strings.ts`,
        );
      }
    }
    for (const m of text.matchAll(
      /\b(placeholder|aria-label|title|alt|label)="([^"]*[A-Za-z]{2,}[^"]*)"/g,
    )) {
      violations.push(
        `${rel}:${lineOf(text, m.index)} hardcoded ${m[1]} ${JSON.stringify(m[2].slice(0, 40))} — copy belongs in src/lib/strings.ts`,
      );
    }
  }

  // 2. Palette / anti-default tripwire — every ts/tsx (globals.css isn't ts,
  // so token definitions never trip; nothing else may hold raw color).
  for (const { name, re, allow } of TRIPWIRE) {
    if (allow?.has(rel)) continue;
    for (const m of text.matchAll(re)) {
      violations.push(`${rel}:${lineOf(text, m.index)} ${name}: ${m[0]}`);
    }
  }
}

walk(SRC);

if (violations.length > 0) {
  console.error(`check:copy FAILED — ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("check:copy OK — no hardcoded copy, no raw palette/banned utilities in src/");
