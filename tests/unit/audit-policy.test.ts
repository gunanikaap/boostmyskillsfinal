import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateAudit,
  validateExceptions,
  type AuditException,
  type AuditVuln,
} from "@/scripts/security/auditPolicy";

/**
 * The dependency gate is a security control, so its allow/deny rules are tested
 * directly. The property that matters most: an exception allows ONE advisory on
 * ONE package — it must never become a package-wide mute that silently inherits
 * future advisories.
 */

const SHARP_GHSA = "GHSA-f88m-g3jw-g9cj";
const TODAY = "2026-07-23";

const sharpException: AuditException = {
  ghsa: SHARP_GHSA,
  package: "sharp",
  transitivelyAffects: ["next"],
  reason: "documented",
  expires: "2026-08-21",
};

function advisory(url: string, severity = "high") {
  return { url, severity, title: url };
}

describe("dependency audit policy", () => {
  it("suppresses exactly the excepted advisory and its declared transitive parent", () => {
    const vulns: Record<string, AuditVuln> = {
      sharp: { severity: "high", via: [advisory(`https://github.com/advisories/${SHARP_GHSA}`)] },
      next: { severity: "high", via: ["sharp"] },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures).toEqual([]);
    expect(r.suppressed).toHaveLength(2);
  });

  it("FAILS on a NEW advisory affecting an already-excepted package", () => {
    const vulns: Record<string, AuditVuln> = {
      sharp: {
        severity: "high",
        via: [
          advisory(`https://github.com/advisories/${SHARP_GHSA}`),
          advisory("https://github.com/advisories/GHSA-aaaa-bbbb-cccc"),
        ],
      },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures.join(" ")).toMatch(/NEW advisory GHSA-AAAA-BBBB-CCCC/i);
  });

  it("FAILS on a new advisory on the transitive parent itself (not just via sharp)", () => {
    // This is the real-world regression: next gained its own advisories while an
    // exception existed for sharp. A package-name-based mute would hide them.
    const vulns: Record<string, AuditVuln> = {
      next: {
        severity: "high",
        via: ["sharp", advisory("https://github.com/advisories/GHSA-p9j2-gv94-2wf4")],
      },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures.join(" ")).toMatch(/GHSA-P9J2-GV94-2WF4/i);
  });

  it("FAILS a critical advisory even when its GHSA is excepted", () => {
    const vulns: Record<string, AuditVuln> = {
      sharp: {
        severity: "critical",
        via: [advisory(`https://github.com/advisories/${SHARP_GHSA}`, "critical")],
      },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures.join(" ")).toMatch(/critical .* can never be excepted/i);
  });

  it("FAILS when the exception has expired", () => {
    const vulns: Record<string, AuditVuln> = {
      sharp: { severity: "high", via: [advisory(`https://github.com/advisories/${SHARP_GHSA}`)] },
    };
    const r = evaluateAudit(vulns, [sharpException], "2026-09-01");
    expect(r.failures.join(" ")).toMatch(/EXPIRED/i);
  });

  it("FAILS when the advisory is on a different package than the exception declares", () => {
    const vulns: Record<string, AuditVuln> = {
      "some-other-pkg": {
        severity: "high",
        via: [advisory(`https://github.com/advisories/${SHARP_GHSA}`)],
      },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures.join(" ")).toMatch(/declared for package "sharp"/i);
  });

  it("FAILS a transitive finding whose parent is not declared in transitivelyAffects", () => {
    const vulns: Record<string, AuditVuln> = {
      "unexpected-parent": { severity: "high", via: ["sharp"] },
    };
    const r = evaluateAudit(vulns, [sharpException], TODAY);
    expect(r.failures.join(" ")).toMatch(/not covered by a declared exception/i);
  });

  it("ignores moderate/low findings (the gate is high+)", () => {
    const vulns: Record<string, AuditVuln> = {
      "fast-xml-parser": {
        severity: "moderate",
        via: [advisory("https://github.com/advisories/GHSA-gh4j-gqv2-49f6", "moderate")],
      },
    };
    const r = evaluateAudit(vulns, [], TODAY);
    expect(r.failures).toEqual([]);
    expect(r.suppressed).toEqual([]);
  });

  it("reports an exception that no longer matches anything as unused", () => {
    const r = evaluateAudit({}, [sharpException], TODAY);
    expect(r.unusedExceptions.join(" ")).toContain(SHARP_GHSA);
  });

  it("rejects malformed exceptions (missing ghsa / package / expiry)", () => {
    expect(() => validateExceptions([{ ...sharpException, ghsa: "nope" }])).toThrow(/ghsa/i);
    expect(() => validateExceptions([{ ...sharpException, package: "" }])).toThrow(/package/i);
    expect(() => validateExceptions([{ ...sharpException, expires: "21-08-2026" }])).toThrow(
      /expires/i,
    );
  });
});

describe("the committed exception file", () => {
  const file = JSON.parse(
    readFileSync(resolve(process.cwd(), "security", "audit-exceptions.json"), "utf8"),
  ) as { exceptions: AuditException[] };

  it("is valid and every entry expires no later than 2026-08-21", () => {
    validateExceptions(file.exceptions);
    for (const e of file.exceptions) {
      expect(e.expires <= "2026-08-21", `${e.ghsa} expires ${e.expires}`).toBe(true);
    }
  });

  it("contains only the documented sharp advisory", () => {
    expect(file.exceptions.map((e) => e.ghsa)).toEqual([SHARP_GHSA]);
  });
});
