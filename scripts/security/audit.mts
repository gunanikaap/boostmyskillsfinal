import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateAudit,
  validateExceptions,
  type AuditException,
  type AuditVuln,
} from "./auditPolicy.ts";

/**
 * Exception-aware production dependency audit gate.
 *
 * Runs `npm audit --omit=dev --json`, then FAILS on any high/critical advisory
 * not covered by a current entry in security/audit-exceptions.json.
 *
 * An exception allows ONE advisory (exact GHSA) on ONE package, with an expiry.
 * A NEW advisory on an already-excepted package FAILS — the exception is not a
 * package-wide mute. Criticals can never be excepted. Expired exceptions fail.
 *
 * The unfiltered truth is always one command away: `npm run security:audit:raw`.
 * This gate passing does NOT mean the raw audit is clean.
 *
 * Exit codes: 0 = clean or fully-excepted; 1 = unexpected/expired advisory, or a
 * malformed audit/exceptions file.
 */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadExceptions(): AuditException[] {
  const p = resolve(process.cwd(), "security", "audit-exceptions.json");
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return [];
  }
  const parsed = JSON.parse(raw) as { exceptions?: AuditException[] };
  const list = parsed.exceptions ?? [];
  validateExceptions(list);
  return list;
}

function runAudit(): Record<string, unknown> {
  const res = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
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

const exceptions = loadExceptions();
const audit = runAudit();
const vulns = (audit.vulnerabilities ?? {}) as Record<string, AuditVuln>;
const { failures, suppressed, unusedExceptions } = evaluateAudit(vulns, exceptions, today());

for (const u of unusedExceptions) {
  console.warn(`WARNING: exception ${u} matched no current advisory — consider removing it.`);
}

if (suppressed.length) {
  console.log("Suppressed (time-boxed, advisory-specific) findings:");
  for (const s of suppressed) console.log(`  - ${s}`);
  console.log(
    "\nNOTE: these remain REAL findings. `npm run security:audit:raw` is still non-zero.",
  );
}

if (failures.length) {
  console.error("\nSecurity audit FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nRun `npm run security:audit:raw` for the full unfiltered report.");
  process.exit(1);
}

console.log(
  `\nSecurity audit passed: no unexpected high/critical advisories ` +
    `(${suppressed.length} time-boxed exception(s) in effect).`,
);
process.exit(0);
