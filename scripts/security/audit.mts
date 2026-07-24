import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateAuditPolicy,
  CLOUD_MARKER_VARS,
  ALLOWED_EXCEPTION_ENVIRONMENTS,
  type AuditException,
} from "./auditPolicy.ts";

/**
 * LOCAL, exception-aware dependency audit gate (FCX-P1-003).
 *
 * This does NOT report a clean audit. It answers a narrower question:
 *   "are the only high/critical findings the exact ones we have formally, and
 *    temporarily, accepted for local development?"
 *
 * The unfiltered truth is `npm run security:audit:raw`, which stays non-zero
 * while any exception is in effect.
 *
 * Fails closed on: unexpected npm exit, empty stdout, invalid/incomplete JSON,
 * unresolvable advisories, malformed/duplicate exceptions, version or dependency
 * path drift, expiry, criticals, cloud markers, and non-local APP_ENV.
 *
 * Exit codes: 0 = only exactly-excepted findings remain; 1 = anything else.
 */

function fail(lines: string[]): never {
  console.error("\nLOCAL EXCEPTION-AWARE AUDIT: FAILED");
  for (const l of lines) console.error(`  - ${l}`);
  console.error("\nRun `npm run security:audit:raw` for the full unfiltered report.");
  process.exit(1);
}

function readExceptionsFile(): unknown {
  const p = resolve(process.cwd(), "security", "audit-exceptions.json");
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return { exceptions: [] };
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    fail([`security/audit-exceptions.json is not valid JSON: ${(err as Error).message}`]);
  }
}

function runAudit(): unknown {
  const res = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    fail([`npm audit could not be executed: ${res.error.message}`]);
  }
  const out = res.stdout?.trim();
  if (!out) {
    const err = res.stderr?.split("\n").slice(0, 5).join("\n") ?? "";
    fail(["npm audit produced no JSON output (failing closed)", err].filter(Boolean));
  }
  try {
    return JSON.parse(out) as unknown;
  } catch {
    fail(["npm audit output was not valid JSON (failing closed)"]);
  }
}

/** Resolve installed versions from the real dependency tree (node_modules). */
function installedVersions(packages: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const name of packages) {
    try {
      const pkgPath = resolve(process.cwd(), "node_modules", name, "package.json");
      const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      out[name] = typeof parsed.version === "string" ? parsed.version : undefined;
    } catch {
      out[name] = undefined;
    }
  }
  return out;
}

// The environment is read from the REAL process environment only. We
// deliberately do NOT load .env files and do NOT default or hardcode
// APP_ENV=local here: a deployment must never be able to masquerade as local.
// A missing APP_ENV therefore fails closed, and the operator must state the
// environment explicitly, e.g.:
//
//     APP_ENV=local npm run security:audit:local
//
// Cloud/deployment markers are rejected regardless of what APP_ENV claims.

const exceptionsFile = readExceptionsFile();
const audit = runAudit();

// Collect every package named by the exceptions (and their declared parents) so
// their installed versions can be verified against the real tree.
const declared = (
  Array.isArray((exceptionsFile as { exceptions?: unknown }).exceptions)
    ? ((exceptionsFile as { exceptions: AuditException[] }).exceptions ?? [])
    : []
) as AuditException[];
const packagesToResolve = new Set<string>();
for (const e of declared) {
  if (typeof e?.package === "string") packagesToResolve.add(e.package);
  for (const p of e?.transitiveParents ?? []) {
    if (typeof p?.package === "string") packagesToResolve.add(p.package);
  }
}

const cloudMarkers: Record<string, string | undefined> = {};
for (const k of CLOUD_MARKER_VARS) cloudMarkers[k] = process.env[k];

const result = evaluateAuditPolicy({
  audit,
  exceptionsFile,
  now: new Date(),
  // RAW value — no normalisation (consistent with FCX-P0-001).
  rawAppEnv: process.env.APP_ENV,
  cloudMarkers,
  installedVersions: installedVersions([...packagesToResolve]),
});

for (const u of result.unusedExceptions) {
  console.warn(`WARNING: exception ${u} matched no current advisory — consider removing it.`);
}

if (!result.ok) fail(result.failures);

if (result.usedException) {
  console.log("=".repeat(72));
  console.log("RAW AUDIT IS NOT CLEAN — findings below are ACCEPTED, not fixed.");
  console.log("=".repeat(72));
  for (const s of result.suppressed) console.log(`  ${s}`);
  for (const e of declared) {
    console.log("");
    console.log(`  exception id     : ${e.id}`);
    console.log(`  advisory         : ${e.ghsa} (${e.severity})`);
    console.log(`  package          : ${e.package}@${e.installedVersion}  ${e.vulnerableRange}`);
    console.log(`  dependency path  : ${e.dependencyPaths.join(", ")}`);
    for (const p of e.transitiveParents ?? []) {
      console.log(`  via parent       : ${p.package}@${p.installedVersion}`);
    }
    console.log(`  allowed env      : ${e.allowedEnvironments.join(", ")} (raw APP_ENV only)`);
    console.log(`  expires (UTC)    : ${e.expiresUtc}`);
    console.log(`  blocked milestone: ${e.blockedMilestone}`);
    console.log(`  CLOUD UAT        : BLOCKED`);
    console.log(`  PRODUCTION       : BLOCKED`);
  }
  console.log("");
  console.log(
    `Local gate passed under APP_ENV="${String(process.env.APP_ENV)}" ` +
      `(allowed: ${ALLOWED_EXCEPTION_ENVIRONMENTS.join(", ")}). This is NOT a clean audit.`,
  );
  process.exit(0);
}

console.log(
  "Local exception-aware audit passed with no high/critical findings and no exception in use.",
);
process.exit(0);
