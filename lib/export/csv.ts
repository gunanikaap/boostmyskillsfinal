/**
 * CSV cell sanitiser — the single source of truth for safe CSV output.
 *
 * Two protections, in order:
 *  1. Spreadsheet formula-injection neutralisation. A cell whose first
 *     non-skippable character is `=`, `+`, `-` or `@` is treated as a formula by
 *     Excel/Sheets/LibreOffice. Spreadsheets skip a run of leading whitespace and
 *     control/zero-width/BOM characters before that character, so we detect the
 *     marker AFTER any such run and prefix a single apostrophe. The original
 *     value is preserved in full after the prefix (nothing is trimmed).
 *  2. RFC-4180 quoting. Applied AFTER the formula guard so the guard also lands
 *     inside quoted (comma/quote/newline-bearing) values.
 *
 * The skip set is defined by numeric code-point ranges (no literal control bytes
 * in the source) so the file stays plain text and reviewable in diffs.
 */

const FORMULA_MARKERS = new Set(["=", "+", "-", "@"]);

// Code-point ranges [lo, hi] a spreadsheet may skip before a formula marker.
const SKIP_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x20], // C0 controls + space (incl. tab, LF, VT, FF, CR)
  [0x85, 0x85], // NEL
  [0xa0, 0xa0], // NBSP
  [0x1680, 0x1680], // Ogham space mark
  [0x2000, 0x200f], // en/em spaces … zero-width + LRM/RLM
  [0x2028, 0x2029], // line / paragraph separators
  [0x202a, 0x202f], // bidi controls + narrow NBSP
  [0x205f, 0x2060], // medium math space + word joiner
  [0x3000, 0x3000], // ideographic space
  [0xfeff, 0xfeff], // byte-order mark / ZWNBSP
];

function isSkippable(code: number): boolean {
  for (const [lo, hi] of SKIP_RANGES) if (code >= lo && code <= hi) return true;
  return false;
}

function startsFormula(s: string): boolean {
  let i = 0;
  while (i < s.length && isSkippable(s.charCodeAt(i))) i++;
  const first = s.charAt(i);
  return first !== "" && FORMULA_MARKERS.has(first);
}

/** Sanitise one CSV cell: formula guard, then RFC-4180 quoting. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (startsFormula(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a row of already-ordered values into an RFC-4180 CSV record. */
export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}
