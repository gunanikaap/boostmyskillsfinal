/**
 * Dependency-audit policy evaluation (pure, fail-closed, unit-tested).
 *
 * FCX-P1-003. This is security-sensitive code, so it is deliberately strict:
 *
 *  - An exception allows ONE advisory (exact GHSA) on ONE package, at ONE exact
 *    installed version, over an EXACT set of dependency paths, at an EXACT
 *    severity, until an EXACT UTC instant.
 *  - A `via` entry that npm reports as a bare package-name string is NEVER
 *    accepted on its own; it must resolve to the underlying advisory object of
 *    that package, and the affected package must be declared as a transitive
 *    parent of that exception.
 *  - Critical advisories are rejected BEFORE any exception is considered.
 *  - Exceptions apply only in an approved LOCAL environment (raw APP_ENV exactly
 *    "local" or "test") and never when a cloud/deployment marker is present.
 *  - Anything unparseable, incomplete, duplicated, or not matching the installed
 *    tree fails closed.
 *
 * Nothing here treats the raw audit as clean: a suppressed finding is still a
 * real finding, and callers must say so.
 */

export const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/** Raw APP_ENV values in which an exception may be applied at all. */
export const ALLOWED_EXCEPTION_ENVIRONMENTS = ["local", "test"] as const;

/**
 * Environment variables whose mere presence indicates a deployed/cloud build.
 * If any is set (non-empty), no exception may be applied — cloud UAT and
 * Production are machine-blocked even if APP_ENV were mis-set to "local".
 */
export const CLOUD_MARKER_VARS = [
  "AWS_BRANCH",
  "AWS_APP_ID",
  "AMPLIFY_APP_ID",
  "AMPLIFY_ENV",
  "AWS_EXECUTION_ENV",
  "CODEBUILD_BUILD_ID",
] as const;

export interface AuditException {
  /** Stable identifier for this exception, e.g. "EX-SHARP-LIBVIPS-2026-07". */
  id: string;
  /** Exact advisory id. */
  ghsa: string;
  /** Exact package the advisory is filed against. */
  package: string;
  /** Exact installed version that was assessed. */
  installedVersion: string;
  /** Exact vulnerable range as reported by npm audit. */
  vulnerableRange: string;
  /** Exact severity as reported by npm audit. */
  severity: string;
  /** Exact dependency node paths this exception covers. */
  dependencyPaths: string[];
  /** Packages that surface this advisory only transitively. */
  transitiveParents?: { package: string; installedVersion: string; dependencyPaths: string[] }[];
  created: string;
  /** Explicit UTC instant. At or after this, the exception fails. */
  expiresUtc: string;
  owner: string;
  rationale: string;
  compensatingControls: string[];
  allowedEnvironments: string[];
  blockedMilestone: string;
  productionProhibited: true;
}

export interface AuditViaObject {
  source?: number | string;
  name?: string;
  url?: string;
  title?: string;
  severity?: string;
  range?: string;
}

export interface AuditVuln {
  name?: string;
  severity: string;
  range?: string;
  nodes?: string[];
  via?: (string | AuditViaObject)[];
}

export interface PolicyInput {
  /** Parsed `npm audit --omit=dev --json` output. */
  audit: unknown;
  /** Parsed contents of security/audit-exceptions.json. */
  exceptionsFile: unknown;
  /** Injectable clock (UTC). */
  now: Date;
  /** RAW process.env.APP_ENV (no normalisation). */
  rawAppEnv: string | undefined;
  /** Cloud marker env values, keyed by variable name. */
  cloudMarkers: Record<string, string | undefined>;
  /** Installed versions resolved from the real dependency tree. */
  installedVersions: Record<string, string | undefined>;
}

export interface PolicyResult {
  ok: boolean;
  failures: string[];
  suppressed: string[];
  unusedExceptions: string[];
  /** True when at least one finding was suppressed by an exception. */
  usedException: boolean;
}

const GHSA_RE = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/i;
const GHSA_IN_URL = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Structural validation. Throws (fail closed) on anything malformed. */
export function parseExceptions(fileContents: unknown): AuditException[] {
  if (!isRecord(fileContents)) throw new Error("exceptions file is not an object");
  const raw = fileContents.exceptions;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("exceptions must be an array");

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const list: AuditException[] = [];

  for (const e of raw) {
    if (!isRecord(e)) throw new Error("exception entry is not an object");
    const req = (k: string): string => {
      const v = e[k];
      if (typeof v !== "string" || v.trim() === "") {
        throw new Error(`exception is missing required string "${k}"`);
      }
      return v;
    };
    const id = req("id");
    const ghsa = req("ghsa");
    if (!GHSA_RE.test(ghsa)) throw new Error(`exception ${id} has an invalid ghsa "${ghsa}"`);
    const pkg = req("package");
    const installedVersion = req("installedVersion");
    const vulnerableRange = req("vulnerableRange");
    const severity = req("severity");
    if (severity === "critical") {
      throw new Error(`exception ${id} may not except a critical advisory`);
    }
    const expiresUtc = req("expiresUtc");
    const expiry = new Date(expiresUtc);
    if (Number.isNaN(expiry.getTime())) {
      throw new Error(`exception ${id} has an unparseable expiresUtc "${expiresUtc}"`);
    }
    const paths = e.dependencyPaths;
    if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string")) {
      throw new Error(`exception ${id} needs a non-empty string dependencyPaths array`);
    }
    const allowedEnvironments = e.allowedEnvironments;
    if (
      !Array.isArray(allowedEnvironments) ||
      allowedEnvironments.length === 0 ||
      !allowedEnvironments.every((v) => typeof v === "string")
    ) {
      throw new Error(`exception ${id} needs a non-empty allowedEnvironments array`);
    }
    for (const env of allowedEnvironments as string[]) {
      if (!(ALLOWED_EXCEPTION_ENVIRONMENTS as readonly string[]).includes(env)) {
        throw new Error(`exception ${id} allows a non-local environment "${env}"`);
      }
    }
    if (e.productionProhibited !== true) {
      throw new Error(`exception ${id} must set productionProhibited: true`);
    }

    if (seenIds.has(id)) throw new Error(`duplicate exception id "${id}"`);
    seenIds.add(id);
    const key = `${ghsa.toUpperCase()}::${pkg}`;
    if (seenKeys.has(key)) throw new Error(`duplicate exception for ${key}`);
    seenKeys.add(key);

    const transitiveParents = (e.transitiveParents ?? []) as AuditException["transitiveParents"];
    if (transitiveParents && !Array.isArray(transitiveParents)) {
      throw new Error(`exception ${id} transitiveParents must be an array`);
    }

    list.push({
      id,
      ghsa,
      package: pkg,
      installedVersion,
      vulnerableRange,
      severity,
      dependencyPaths: paths as string[],
      transitiveParents,
      created: typeof e.created === "string" ? e.created : "",
      expiresUtc,
      owner: req("owner"),
      rationale: req("rationale"),
      compensatingControls: Array.isArray(e.compensatingControls)
        ? (e.compensatingControls as string[])
        : [],
      allowedEnvironments: allowedEnvironments as string[],
      blockedMilestone: req("blockedMilestone"),
      productionProhibited: true,
    });
  }
  return list;
}

function ghsaOfVia(via: AuditViaObject): string | null {
  const direct = typeof via.url === "string" ? GHSA_IN_URL.exec(via.url) : null;
  if (direct) return direct[0].toUpperCase();
  return null;
}

/**
 * Evaluate an audit result against the exception policy.
 * Never throws for policy reasons — it reports failures. It DOES fail closed
 * (ok:false) for malformed input.
 */
export function evaluateAuditPolicy(input: PolicyInput): PolicyResult {
  const failures: string[] = [];
  const suppressed: string[] = [];
  const usedGhsa = new Set<string>();

  // --- exceptions: structural validation (fail closed) ----------------------
  let exceptions: AuditException[];
  try {
    exceptions = parseExceptions(input.exceptionsFile);
  } catch (err) {
    return {
      ok: false,
      failures: [`exception file is invalid: ${(err as Error).message}`],
      suppressed: [],
      unusedExceptions: [],
      usedException: false,
    };
  }

  // --- audit shape: fail closed --------------------------------------------
  if (!isRecord(input.audit)) {
    return {
      ok: false,
      failures: ["audit output could not be parsed as an object"],
      suppressed: [],
      unusedExceptions: [],
      usedException: false,
    };
  }
  const vulnsRaw = input.audit.vulnerabilities;
  if (vulnsRaw === undefined || !isRecord(vulnsRaw)) {
    return {
      ok: false,
      failures: ["audit output has no usable `vulnerabilities` object"],
      suppressed: [],
      unusedExceptions: [],
      usedException: false,
    };
  }
  const vulns = vulnsRaw as Record<string, AuditVuln>;

  // --- environment: may an exception be applied here at all? ---------------
  const activeCloudMarkers = CLOUD_MARKER_VARS.filter((k) => {
    const v = input.cloudMarkers[k];
    return typeof v === "string" && v.trim() !== "";
  });
  const envAllowed =
    input.rawAppEnv !== undefined &&
    (ALLOWED_EXCEPTION_ENVIRONMENTS as readonly string[]).includes(input.rawAppEnv);
  const exceptionsUsable = envAllowed && activeCloudMarkers.length === 0;
  const envReason =
    activeCloudMarkers.length > 0
      ? `deployment marker(s) present: ${activeCloudMarkers.join(", ")}`
      : input.rawAppEnv === undefined
        ? "APP_ENV is not set"
        : `APP_ENV="${input.rawAppEnv}" is not an approved local environment ` +
          `(${ALLOWED_EXCEPTION_ENVIRONMENTS.join(", ")})`;

  /** Resolve the advisory objects that make a package vulnerable. */
  function advisoriesOf(name: string, seen: Set<string>): AuditViaObject[] | null {
    if (seen.has(name)) return null; // cycle → unresolved → fail closed
    seen.add(name);
    const v = vulns[name];
    if (!v || !Array.isArray(v.via)) return null;
    const out: AuditViaObject[] = [];
    for (const via of v.via) {
      if (typeof via === "string") {
        const nested = advisoriesOf(via, seen);
        if (nested === null) return null;
        out.push(...nested);
      } else if (isRecord(via)) {
        out.push(via as AuditViaObject);
      } else {
        return null;
      }
    }
    return out;
  }

  for (const [name, vuln] of Object.entries(vulns)) {
    if (!vuln || typeof vuln.severity !== "string") {
      failures.push(`advisory entry "${name}" is malformed`);
      continue;
    }
    if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;

    // 4.3 — criticals are rejected BEFORE any exception processing.
    if (vuln.severity === "critical") {
      failures.push(`CRITICAL advisory in "${name}" — no exception may suppress a critical`);
      continue;
    }

    const nodes = Array.isArray(vuln.nodes) ? vuln.nodes : [];
    const reasons: string[] = [];
    let covered = true;

    // 4.2 — resolve every via entry to concrete advisory objects.
    const advisories = advisoriesOf(name, new Set());
    if (advisories === null || advisories.length === 0) {
      failures.push(
        `"${name}" has advisories that could not be resolved unambiguously — failing closed`,
      );
      continue;
    }

    for (const adv of advisories) {
      const id = ghsaOfVia(adv);
      if (!id) {
        covered = false;
        reasons.push(`advisory without a resolvable GHSA id (${adv.title ?? "unknown"})`);
        continue;
      }
      if ((adv.severity ?? "").toLowerCase() === "critical") {
        covered = false;
        reasons.push(`${id} is critical and can never be excepted`);
        continue;
      }
      const ex = exceptions.find((e) => e.ghsa.toUpperCase() === id);
      if (!ex) {
        covered = false;
        reasons.push(`advisory ${id} has no exception`);
        continue;
      }

      // The advisory's own package must match the exception's package.
      const advPackage = typeof adv.name === "string" ? adv.name : ex.package;
      if (advPackage !== ex.package) {
        covered = false;
        reasons.push(
          `${id} is declared for package "${ex.package}" but reported on "${advPackage}"`,
        );
        continue;
      }
      if ((adv.severity ?? vuln.severity) !== ex.severity) {
        covered = false;
        reasons.push(
          `${id} severity changed: audit says "${adv.severity ?? vuln.severity}", exception allows "${ex.severity}"`,
        );
        continue;
      }
      if (typeof adv.range === "string" && adv.range !== ex.vulnerableRange) {
        covered = false;
        reasons.push(
          `${id} range changed: audit says "${adv.range}", exception allows "${ex.vulnerableRange}"`,
        );
        continue;
      }

      // Installed version must match exactly.
      const installed = input.installedVersions[ex.package];
      if (installed === undefined) {
        covered = false;
        reasons.push(`${id}: exception package "${ex.package}" is not installed`);
        continue;
      }
      if (installed !== ex.installedVersion) {
        covered = false;
        reasons.push(
          `${id}: installed ${ex.package}@${installed} does not match excepted ${ex.installedVersion}`,
        );
        continue;
      }

      // Dependency path must match exactly (no additional or missing paths).
      const expectedPaths =
        name === ex.package
          ? ex.dependencyPaths
          : (ex.transitiveParents ?? []).find((p) => p.package === name)?.dependencyPaths;
      if (!expectedPaths) {
        covered = false;
        reasons.push(`${id}: "${name}" is not a declared transitive parent of this exception`);
        continue;
      }
      if (!sameSet(nodes, expectedPaths)) {
        covered = false;
        reasons.push(
          `${id}: dependency path mismatch for "${name}" — audit ${JSON.stringify(nodes)} vs allowed ${JSON.stringify(expectedPaths)}`,
        );
        continue;
      }

      // Transitive parent's own installed version must match too.
      if (name !== ex.package) {
        const parent = (ex.transitiveParents ?? []).find((p) => p.package === name)!;
        const parentInstalled = input.installedVersions[name];
        if (parentInstalled === undefined || parentInstalled !== parent.installedVersion) {
          covered = false;
          reasons.push(
            `${id}: transitive parent ${name}@${parentInstalled ?? "missing"} does not match excepted ${parent.installedVersion}`,
          );
          continue;
        }
      }

      // 4.5 — expiry at an explicit UTC instant.
      const expiry = new Date(ex.expiresUtc).getTime();
      if (input.now.getTime() >= expiry) {
        covered = false;
        reasons.push(`${id}: exception ${ex.id} EXPIRED at ${ex.expiresUtc}`);
        continue;
      }

      // 4.4 — environment must permit exceptions at all.
      if (!exceptionsUsable) {
        covered = false;
        reasons.push(`${id}: exceptions are not permitted here — ${envReason}`);
        continue;
      }
      if (!ex.allowedEnvironments.includes(input.rawAppEnv as string)) {
        covered = false;
        reasons.push(
          `${id}: exception ${ex.id} does not allow APP_ENV="${String(input.rawAppEnv)}"`,
        );
        continue;
      }

      usedGhsa.add(id);
      reasons.push(`${id} (${ex.id}) allowed until ${ex.expiresUtc}`);
    }

    if (covered) {
      suppressed.push(`${name} (${vuln.severity}) — ${reasons.join("; ")}`);
    } else {
      failures.push(`${vuln.severity.toUpperCase()} in "${name}": ${reasons.join("; ")}`);
    }
  }

  const unusedExceptions = exceptions
    .filter((e) => !usedGhsa.has(e.ghsa.toUpperCase()))
    .map((e) => `${e.id} (${e.ghsa} / ${e.package})`);

  return {
    ok: failures.length === 0,
    failures,
    suppressed,
    unusedExceptions,
    usedException: suppressed.length > 0,
  };
}
