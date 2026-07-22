import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Exception-aware production dependency audit gate.
 *
 * Runs `npm audit --omit=dev --json`, then FAILS on any high/critical advisory
 * that is not covered by a current entry in security/audit-exceptions.json.
 *
 * An exception must be explicit and time-boxed: an EXPIRED exception fails the
 * gate (forcing re-evaluation), and an exception that no longer matches any
 * advisory is reported as stale (warning). The unfiltered truth is always one
 * command away: `npm run security:audit:raw`.
 *
 * Exit codes: 0 = clean or fully-excepted; 1 = unexpected/expired advisory or
 * a malformed audit/exceptions file.
 */

const BLOCKING = new Set(["high", "critical"]);

interface Exception {
  ghsa?: string;
  packages?: string[];
  severity?: string;
  advisory?: string;
  reason: string;
  expires: string; // YYYY-MM-DD
  addedOn?: string;
}

function today(): string {
  // APP-independent, timezone-stable date (UTC) for expiry comparison.
  return new Date().toISOString().slice(0, 10);
}

function loadExceptions(): Exception[] {
  const p = resolve(process.cwd(), "security", "audit-exceptions.json");
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return [];
  }
  const parsed = JSON.parse(raw) as { exceptions?: Exception[] };
  const list = parsed.exceptions ?? [];
  for (const e of list) {
    if (!e.reason || !e.expires || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires)) {
      throw new Error(
        `Invalid exception (needs reason + YYYY-MM-DD expires): ${JSON.stringify(e)}`,
      );
    }
  }
  return list;
}

function runAudit(): Record<string, unknown> {
  const res = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  // npm audit exits non-zero when advisories exist; the JSON is still on stdout.
  const out = res.stdout?.trim();
  if (!out) {
    console.error("npm audit produced no JSON output.");
    if (res.stderr) console.error(res.stderr.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
  }
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    console.error("Could not parse npm audit JSON.");
    process.exit(1);
  }
}

interface Via {
  url?: string;
  title?: string;
  source?: number | string;
  name?: string;
}
interface Vuln {
  name?: string;
  severity: string;
  via?: (string | Via)[];
}

function viaUrls(v: Vuln): string[] {
  return (v.via ?? []).map((x) => (typeof x === "string" ? "" : (x.url ?? ""))).filter(Boolean);
}

function matchException(name: string, v: Vuln, exceptions: Exception[]): Exception | null {
  const urls = viaUrls(v);
  const viaNames = (v.via ?? []).map((x) => (typeof x === "string" ? x : (x.name ?? "")));
  for (const e of exceptions) {
    const byGhsa = e.ghsa ? urls.some((u) => u.includes(e.ghsa!)) : false;
    const byPkg = e.packages
      ? e.packages.includes(name) || viaNames.some((n) => e.packages!.includes(n))
      : false;
    if (byGhsa || byPkg) return e;
  }
  return null;
}

const exceptions = loadExceptions();
const audit = runAudit();
const vulns = (audit.vulnerabilities ?? {}) as Record<string, Vuln>;
const now = today();

const failures: string[] = [];
const suppressed: string[] = [];
const usedGhsaOrPkg = new Set<string>();

for (const [name, v] of Object.entries(vulns)) {
  if (!BLOCKING.has(v.severity)) continue;
  const ex = matchException(name, v, exceptions);
  if (!ex) {
    failures.push(`UNEXPECTED ${v.severity} advisory in "${name}" (no exception).`);
    continue;
  }
  usedGhsaOrPkg.add(ex.ghsa ?? (ex.packages ?? []).join(","));
  if (ex.expires < now) {
    failures.push(
      `EXPIRED exception for "${name}" (${ex.ghsa ?? ex.packages?.join(",")}) — expired ${ex.expires}; re-evaluate.`,
    );
  } else {
    suppressed.push(`${name} (${v.severity}) — excepted until ${ex.expires}: ${ex.reason}`);
  }
}

// Stale exceptions (no longer matched by any advisory) are a warning, not a fail.
for (const e of exceptions) {
  const key = e.ghsa ?? (e.packages ?? []).join(",");
  if (!usedGhsaOrPkg.has(key)) {
    console.warn(`WARNING: exception ${key} matched no current advisory — consider removing it.`);
  }
}

if (suppressed.length) {
  console.log("Suppressed (time-boxed) advisories:");
  for (const s of suppressed) console.log(`  - ${s}`);
}

if (failures.length) {
  console.error("\nSecurity audit FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nRun `npm run security:audit:raw` for the full unfiltered report.");
  process.exit(1);
}

console.log(
  `\nSecurity audit passed: no unexpected high/critical advisories (${suppressed.length} time-boxed exception(s) in effect).`,
);
process.exit(0);
