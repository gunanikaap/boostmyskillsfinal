import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateAuditPolicy,
  parseExceptions,
  ALLOWED_EXCEPTION_ENVIRONMENTS,
  CLOUD_MARKER_VARS,
  type PolicyInput,
} from "@/scripts/security/auditPolicy";

/**
 * FCX-P1-003 — the dependency exception gate is security-sensitive, so its
 * allow/deny rules are exhaustively tested.
 *
 * Core property: an exception allows ONE advisory, on ONE package, at ONE exact
 * installed version, over an EXACT dependency path set, at an EXACT severity,
 * until an EXACT UTC instant, and ONLY in an approved local environment with no
 * cloud marker present. Anything else — including anything unparseable — fails.
 */

const GHSA = "GHSA-f88m-g3jw-g9cj";
const NOW = new Date("2026-07-24T00:00:00.000Z");
const EXPIRY = "2026-08-21T00:00:00.000Z";

function exception(over: Record<string, unknown> = {}) {
  return {
    id: "EX-SHARP-LIBVIPS-2026-07",
    ghsa: GHSA,
    package: "sharp",
    installedVersion: "0.34.5",
    vulnerableRange: "<0.35.0",
    severity: "high",
    dependencyPaths: ["node_modules/sharp"],
    transitiveParents: [
      { package: "next", installedVersion: "15.5.21", dependencyPaths: ["node_modules/next"] },
    ],
    created: "2026-07-22",
    expiresUtc: EXPIRY,
    owner: "project owner",
    rationale: "documented",
    compensatingControls: ["not reachable"],
    allowedEnvironments: ["local", "test"],
    blockedMilestone: "first cloud UAT",
    productionProhibited: true,
    ...over,
  };
}

/** The real-world audit shape: sharp advisory + next affected transitively. */
function audit(over: Record<string, unknown> = {}) {
  return {
    vulnerabilities: {
      sharp: {
        name: "sharp",
        severity: "high",
        range: "<0.35.0",
        nodes: ["node_modules/sharp"],
        via: [
          {
            source: 1124066,
            name: "sharp",
            url: `https://github.com/advisories/${GHSA}`,
            title: "sharp inherited vulnerabilities in libvips",
            severity: "high",
            range: "<0.35.0",
          },
        ],
        effects: ["next"],
      },
      next: {
        name: "next",
        severity: "high",
        nodes: ["node_modules/next"],
        via: ["sharp"],
        effects: [],
      },
      ...((over.vulnerabilities as Record<string, unknown>) ?? {}),
    },
  };
}

function input(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    audit: audit(),
    exceptionsFile: { exceptions: [exception()] },
    now: NOW,
    rawAppEnv: "local",
    cloudMarkers: {},
    installedVersions: { sharp: "0.34.5", next: "15.5.21" },
    ...over,
  };
}

describe("FCX-P1-003: exception gate — the ONLY allowed success", () => {
  it("passes for the exact audit, exception, version, path, severity and env", () => {
    const r = evaluateAuditPolicy(input());
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.usedException).toBe(true);
    expect(r.suppressed).toHaveLength(2); // sharp + its transitive parent next
  });

  it.each(ALLOWED_EXCEPTION_ENVIRONMENTS)("passes under APP_ENV=%s", (env) => {
    expect(evaluateAuditPolicy(input({ rawAppEnv: env })).ok).toBe(true);
  });

  it("passes trivially when there are no high/critical findings at all", () => {
    const r = evaluateAuditPolicy(
      input({ audit: { vulnerabilities: {} }, exceptionsFile: { exceptions: [] } }),
    );
    expect(r.ok).toBe(true);
    expect(r.usedException).toBe(false);
  });
});

describe("FCX-P1-003: advisory identity failures", () => {
  it("1. fails on an unrelated NEW advisory affecting next", () => {
    const a = audit();
    (a.vulnerabilities.next as Record<string, unknown>).via = [
      "sharp",
      {
        name: "next",
        url: "https://github.com/advisories/GHSA-p9j2-gv94-2wf4",
        severity: "high",
        range: "<15.5.21",
      },
    ];
    const r = evaluateAuditPolicy(input({ audit: a }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/GHSA-P9J2-GV94-2WF4.*no exception/i);
  });

  it("2. fails on an unrelated NEW advisory affecting sharp", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).via = [
      {
        name: "sharp",
        url: `https://github.com/advisories/${GHSA}`,
        severity: "high",
        range: "<0.35.0",
      },
      {
        name: "sharp",
        url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
        severity: "high",
        range: "<0.36.0",
      },
    ];
    const r = evaluateAuditPolicy(input({ audit: a }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/GHSA-AAAA-BBBB-CCCC/i);
  });

  it("3. fails when the advisory has no resolvable GHSA id", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).via = [
      { name: "sharp", title: "mystery", severity: "high" },
    ];
    expect(evaluateAuditPolicy(input({ audit: a })).ok).toBe(false);
  });

  it("4. fails when the GHSA is reported on a different package", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).via = [
      {
        name: "some-other-pkg",
        url: `https://github.com/advisories/${GHSA}`,
        severity: "high",
        range: "<0.35.0",
      },
    ];
    const r = evaluateAuditPolicy(input({ audit: a }));
    expect(r.failures.join(" ")).toMatch(/declared for package "sharp"/i);
  });
});

describe("FCX-P1-003: version / path failures", () => {
  it("5. fails when the installed version differs from the excepted version", () => {
    const r = evaluateAuditPolicy(
      input({ installedVersions: { sharp: "0.34.4", next: "15.5.21" } }),
    );
    expect(r.failures.join(" ")).toMatch(/installed sharp@0\.34\.4 does not match/i);
  });

  it("6. fails when the excepted package is not installed at all", () => {
    const r = evaluateAuditPolicy(input({ installedVersions: { next: "15.5.21" } }));
    expect(r.failures.join(" ")).toMatch(/is not installed/i);
  });

  it("7. fails when the transitive parent's installed version drifts", () => {
    const r = evaluateAuditPolicy(
      input({ installedVersions: { sharp: "0.34.5", next: "15.5.20" } }),
    );
    expect(r.failures.join(" ")).toMatch(/transitive parent next@15\.5\.20 does not match/i);
  });

  it("8. fails on a DIFFERENT dependency path", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).nodes = ["node_modules/other/sharp"];
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(
      /dependency path mismatch/i,
    );
  });

  it("9. fails on an ADDITIONAL dependency path", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).nodes = [
      "node_modules/sharp",
      "node_modules/next/node_modules/sharp",
    ];
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(
      /dependency path mismatch/i,
    );
  });

  it("10. fails when a transitive parent is not declared in the exception", () => {
    const a = audit();
    (a.vulnerabilities as Record<string, unknown>).someTool = {
      name: "someTool",
      severity: "high",
      nodes: ["node_modules/someTool"],
      via: ["sharp"],
    };
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(
      /not a declared transitive parent/i,
    );
  });

  it("11. fails when the vulnerable range changes", () => {
    const a = audit();
    (
      (a.vulnerabilities.sharp as Record<string, unknown>).via as Record<string, unknown>[]
    )[0]!.range = "<0.36.0";
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(/range changed/i);
  });
});

describe("FCX-P1-003: severity failures", () => {
  it("12. fails when the excepted advisory is reclassified critical", () => {
    const a = audit();
    (a.vulnerabilities.sharp as Record<string, unknown>).severity = "critical";
    const r = evaluateAuditPolicy(input({ audit: a }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/CRITICAL advisory in "sharp"/i);
  });

  it("13. fails on ANY unrelated critical", () => {
    const a = audit();
    (a.vulnerabilities as Record<string, unknown>).evil = {
      name: "evil",
      severity: "critical",
      nodes: ["node_modules/evil"],
      via: [
        {
          name: "evil",
          url: "https://github.com/advisories/GHSA-zzzz-yyyy-xxxx",
          severity: "critical",
        },
      ],
    };
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(/CRITICAL/);
  });

  it("14. fails when the advisory severity no longer matches the exception", () => {
    const a = audit();
    (
      (a.vulnerabilities.sharp as Record<string, unknown>).via as Record<string, unknown>[]
    )[0]!.severity = "moderate";
    expect(evaluateAuditPolicy(input({ audit: a })).failures.join(" ")).toMatch(
      /severity changed/i,
    );
  });

  it("15. an exception may never be authored for a critical severity", () => {
    expect(() => parseExceptions({ exceptions: [exception({ severity: "critical" })] })).toThrow(
      /may not except a critical/i,
    );
  });
});

describe("FCX-P1-003: expiry (injectable UTC clock)", () => {
  it("16. passes one second BEFORE expiry", () => {
    const r = evaluateAuditPolicy(input({ now: new Date(Date.parse(EXPIRY) - 1000) }));
    expect(r.ok).toBe(true);
  });

  it("17. FAILS at the exact expiry instant", () => {
    const r = evaluateAuditPolicy(input({ now: new Date(Date.parse(EXPIRY)) }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/EXPIRED/);
  });

  it("18. FAILS one second after expiry", () => {
    const r = evaluateAuditPolicy(input({ now: new Date(Date.parse(EXPIRY) + 1000) }));
    expect(r.failures.join(" ")).toMatch(/EXPIRED/);
  });

  it("19. rejects an invalid or missing expiry at parse time", () => {
    expect(() =>
      parseExceptions({ exceptions: [exception({ expiresUtc: "not-a-date" })] }),
    ).toThrow(/unparseable expiresUtc/i);
    expect(() => parseExceptions({ exceptions: [exception({ expiresUtc: undefined })] })).toThrow(
      /expiresUtc/i,
    );
  });

  it("20. compares as a UTC instant, not a local-timezone date", () => {
    // 23:59:59Z on 2026-08-20 is before expiry everywhere; 00:00:00Z on the 21st is not.
    expect(evaluateAuditPolicy(input({ now: new Date("2026-08-20T23:59:59.000Z") })).ok).toBe(true);
    expect(evaluateAuditPolicy(input({ now: new Date("2026-08-21T00:00:00.000Z") })).ok).toBe(
      false,
    );
  });
});

describe("FCX-P1-003: environment enforcement", () => {
  it.each(["uat", "staging", "production", "TEST", "Local", "development", "", "dev"])(
    "21. fails under APP_ENV=%s",
    (env) => {
      const r = evaluateAuditPolicy(input({ rawAppEnv: env }));
      expect(r.ok).toBe(false);
      expect(r.failures.join(" ")).toMatch(/not permitted here/i);
    },
  );

  it("22. fails when APP_ENV is missing entirely", () => {
    const r = evaluateAuditPolicy(input({ rawAppEnv: undefined }));
    expect(r.failures.join(" ")).toMatch(/APP_ENV is not set/i);
  });

  it.each(CLOUD_MARKER_VARS)("23. fails when cloud marker %s is present, even under local", (v) => {
    const r = evaluateAuditPolicy(input({ rawAppEnv: "local", cloudMarkers: { [v]: "anything" } }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/deployment marker/i);
  });

  it("24. ignores blank cloud marker values", () => {
    expect(evaluateAuditPolicy(input({ cloudMarkers: { AWS_BRANCH: "   " } })).ok).toBe(true);
  });

  it("25. fails when the exception itself does not list the current environment", () => {
    const r = evaluateAuditPolicy(
      input({
        rawAppEnv: "test",
        exceptionsFile: { exceptions: [exception({ allowedEnvironments: ["local"] })] },
      }),
    );
    expect(r.failures.join(" ")).toMatch(/does not allow APP_ENV="test"/i);
  });
});

describe("FCX-P1-003: malformed input fails closed", () => {
  it("26. fails when the audit JSON is not an object", () => {
    expect(evaluateAuditPolicy(input({ audit: "boom" })).ok).toBe(false);
    expect(evaluateAuditPolicy(input({ audit: null })).ok).toBe(false);
  });

  it("27. fails when the vulnerabilities field is missing", () => {
    const r = evaluateAuditPolicy(input({ audit: {} }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/no usable `vulnerabilities`/i);
  });

  it("28. fails when a transitive string cannot be resolved", () => {
    const a = {
      vulnerabilities: { next: { name: "next", severity: "high", nodes: [], via: ["ghost"] } },
    };
    const r = evaluateAuditPolicy(input({ audit: a }));
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/could not be resolved/i);
  });

  it("29. fails on a cyclic transitive reference", () => {
    const a = {
      vulnerabilities: {
        a: { name: "a", severity: "high", nodes: [], via: ["b"] },
        b: { name: "b", severity: "high", nodes: [], via: ["a"] },
      },
    };
    expect(evaluateAuditPolicy(input({ audit: a })).ok).toBe(false);
  });

  it("30. fails on malformed exception JSON", () => {
    expect(evaluateAuditPolicy(input({ exceptionsFile: "nope" })).ok).toBe(false);
    expect(evaluateAuditPolicy(input({ exceptionsFile: { exceptions: "nope" } })).ok).toBe(false);
  });

  it("31. fails on a duplicate exception (same id, or same ghsa+package)", () => {
    expect(() => parseExceptions({ exceptions: [exception(), exception()] })).toThrow(/duplicate/i);
    expect(() =>
      parseExceptions({ exceptions: [exception(), exception({ id: "OTHER" })] }),
    ).toThrow(/duplicate exception for/i);
  });

  it("32. fails on a malformed advisory entry", () => {
    const a = { vulnerabilities: { sharp: { nodes: [] } } };
    expect(evaluateAuditPolicy(input({ audit: a })).ok).toBe(false);
  });

  it("33. rejects exceptions missing required fields or allowing a non-local env", () => {
    expect(() => parseExceptions({ exceptions: [exception({ ghsa: "nope" })] })).toThrow(/ghsa/i);
    expect(() => parseExceptions({ exceptions: [exception({ owner: "" })] })).toThrow(/owner/i);
    expect(() => parseExceptions({ exceptions: [exception({ dependencyPaths: [] })] })).toThrow(
      /dependencyPaths/i,
    );
    expect(() =>
      parseExceptions({ exceptions: [exception({ allowedEnvironments: ["production"] })] }),
    ).toThrow(/non-local environment/i);
    expect(() =>
      parseExceptions({ exceptions: [exception({ productionProhibited: false })] }),
    ).toThrow(/productionProhibited/i);
  });
});

describe("FCX-P1-003: the committed exception file", () => {
  const file = JSON.parse(
    readFileSync(resolve(process.cwd(), "security", "audit-exceptions.json"), "utf8"),
  ) as unknown;

  it("is structurally valid", () => {
    expect(() => parseExceptions(file)).not.toThrow();
  });

  it("contains only the documented sharp advisory, expiring no later than 2026-08-21", () => {
    const list = parseExceptions(file);
    expect(list.map((e) => e.ghsa)).toEqual([GHSA]);
    expect(list[0]!.package).toBe("sharp");
    expect(Date.parse(list[0]!.expiresUtc)).toBeLessThanOrEqual(
      Date.parse("2026-08-21T00:00:00.000Z"),
    );
    expect(list[0]!.allowedEnvironments.sort()).toEqual(["local", "test"]);
    expect(list[0]!.productionProhibited).toBe(true);
  });

  it("reports an exception that matches nothing as unused", () => {
    const r = evaluateAuditPolicy(input({ audit: { vulnerabilities: {} } }));
    expect(r.unusedExceptions.join(" ")).toContain("EX-SHARP-LIBVIPS-2026-07");
  });
});
