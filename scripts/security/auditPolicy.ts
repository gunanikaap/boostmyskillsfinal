/**
 * Dependency-audit policy evaluation (pure, unit-tested).
 *
 * Separated from the CLI so the exact allow/deny rules can be tested without
 * running `npm audit`.
 *
 * The rule that matters: an exception allows ONE specific advisory (GHSA id) on
 * ONE specific package. It is deliberately NOT a package-wide mute — if a NEW
 * advisory appears on an already-excepted package, the gate must fail so the new
 * issue is triaged rather than silently inherited.
 *
 * A package whose only finding is "depends on a vulnerable version of <pkg>"
 * (npm reports these as a plain string in `via`) is allowed only when that
 * depended-on package is itself fully excepted, and only when the exception
 * names it in `transitivelyAffects`.
 */

export const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
/** Critical advisories can never be excepted. */
export const NEVER_EXCEPTABLE = new Set(["critical"]);

export interface AuditException {
  /** Exact advisory id, e.g. "GHSA-f88m-g3jw-g9cj". Required. */
  ghsa: string;
  /** Exact package the advisory is filed against. Required. */
  package: string;
  /** Packages that surface this advisory only transitively (e.g. "next" via "sharp"). */
  transitivelyAffects?: string[];
  severity?: string;
  advisory?: string;
  reason: string;
  /** YYYY-MM-DD. An expired exception fails the gate. */
  expires: string;
  expiresNote?: string;
  addedOn?: string;
}

export interface AuditVia {
  url?: string;
  title?: string;
  severity?: string;
  name?: string;
}

export interface AuditVuln {
  name?: string;
  severity: string;
  via?: (string | AuditVia)[];
}

export interface PolicyResult {
  failures: string[];
  suppressed: string[];
  unusedExceptions: string[];
}

const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

/** Extract the advisory id from a `via` entry's URL, if present. */
function ghsaOf(via: AuditVia): string | null {
  const m = GHSA_RE.exec(via.url ?? "");
  return m ? m[0].toUpperCase() : null;
}

export function validateExceptions(list: AuditException[]): void {
  for (const e of list) {
    if (!e.ghsa || !GHSA_RE.test(e.ghsa)) {
      throw new Error(`Exception needs a valid "ghsa" id: ${JSON.stringify(e)}`);
    }
    if (!e.package) {
      throw new Error(`Exception ${e.ghsa} needs an exact "package".`);
    }
    if (!e.reason) {
      throw new Error(`Exception ${e.ghsa} needs a "reason".`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? "")) {
      throw new Error(`Exception ${e.ghsa} needs "expires" as YYYY-MM-DD.`);
    }
  }
}

/**
 * Decide pass/fail for an `npm audit --json` result.
 *
 * @param vulns  the `vulnerabilities` map from npm audit
 * @param exceptions parsed exception list
 * @param today  ISO date (YYYY-MM-DD) used for expiry comparison
 */
export function evaluateAudit(
  vulns: Record<string, AuditVuln>,
  exceptions: AuditException[],
  today: string,
): PolicyResult {
  const failures: string[] = [];
  const suppressed: string[] = [];
  const usedGhsa = new Set<string>();

  const byGhsa = new Map(exceptions.map((e) => [e.ghsa.toUpperCase(), e]));
  /** Packages fully excepted (so a transitive "depends on X" finding can clear). */
  const exceptedPackages = new Set(exceptions.map((e) => e.package));

  for (const [name, vuln] of Object.entries(vulns)) {
    if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;

    const vias = vuln.via ?? [];
    const reasons: string[] = [];
    let allCovered = vias.length > 0;

    for (const via of vias) {
      if (typeof via === "string") {
        // "depends on a vulnerable version of <via>". Allowed only when that
        // package is itself excepted AND this package is declared as affected.
        const ex = exceptions.find(
          (e) => e.package === via && (e.transitivelyAffects ?? []).includes(name),
        );
        if (!ex) {
          allCovered = false;
          reasons.push(`transitive via "${via}" is not covered by a declared exception`);
        } else {
          usedGhsa.add(ex.ghsa.toUpperCase());
          reasons.push(`transitively via ${via} (${ex.ghsa})`);
        }
        continue;
      }

      // A concrete advisory. Only an EXACT ghsa match may excuse it.
      const id = ghsaOf(via);
      if (!id) {
        allCovered = false;
        reasons.push(`advisory without a recognisable GHSA id (${via.title ?? "unknown"})`);
        continue;
      }
      const ex = byGhsa.get(id);
      if (!ex) {
        allCovered = false;
        reasons.push(`NEW advisory ${id} on "${name}" has no exception`);
        continue;
      }
      if (ex.package !== name) {
        allCovered = false;
        reasons.push(`exception ${id} is declared for package "${ex.package}", not "${name}"`);
        continue;
      }
      if (NEVER_EXCEPTABLE.has((via.severity ?? vuln.severity).toLowerCase())) {
        allCovered = false;
        reasons.push(`critical advisory ${id} can never be excepted`);
        continue;
      }
      if (ex.expires < today) {
        allCovered = false;
        reasons.push(`exception ${id} EXPIRED on ${ex.expires}`);
        continue;
      }
      usedGhsa.add(id);
      reasons.push(`${id} excepted until ${ex.expires}`);
    }

    if (allCovered) {
      suppressed.push(`${name} (${vuln.severity}) — ${reasons.join("; ")}`);
    } else {
      failures.push(`${vuln.severity.toUpperCase()} in "${name}": ${reasons.join("; ")}`);
    }
  }

  const unusedExceptions = exceptions
    .filter((e) => !usedGhsa.has(e.ghsa.toUpperCase()))
    .map((e) => `${e.ghsa} (${e.package})`);

  return { failures, suppressed, unusedExceptions };
}
