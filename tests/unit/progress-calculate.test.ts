import { describe, expect, it } from "vitest";
import { calculateCredentialProgress, type UnitProgressRow } from "@/lib/progress/calculate";
import type { ContentDocument } from "@/lib/content/schema";

/**
 * Canonical progress calculation — the core correctness the architecture review
 * flagged: percentages must be computed against EVERY assigned unit, not only the
 * units that happen to have a unit_progress row.
 */

/** Build a content doc with `n` reading units in one section/subsection. */
function content(unitIds: string[], layout?: { sub2?: string[] }): ContentDocument {
  const mk = (id: string) => ({
    id,
    sourceKey: null,
    title: `Unit ${id}`,
    type: "reading" as const,
    required: true,
    data: { html: "" },
  });
  const subsections = [{ id: "ss1", sourceKey: null, title: "Sub 1", units: unitIds.map(mk) }];
  if (layout?.sub2) {
    subsections.push({ id: "ss2", sourceKey: null, title: "Sub 2", units: layout.sub2.map(mk) });
  }
  return {
    schemaVersion: 1,
    sections: [{ id: "s1", sourceKey: null, title: "Section 1", subsections }],
  } as unknown as ContentDocument;
}

const row = (unitId: string, status: string, progressPercent: number): UnitProgressRow => ({
  unitId,
  status,
  progressPercent,
});

describe("calculateCredentialProgress", () => {
  it("zero rows over four units = 0%", () => {
    const r = calculateCredentialProgress(content(["a", "b", "c", "d"]), []);
    expect(r.percent).toBe(0);
    expect(r.status).toBe("not_started");
    expect(r.totalUnits).toBe(4);
    expect(r.completedUnits).toBe(0);
  });

  it("one completed of four = 25%", () => {
    const r = calculateCredentialProgress(content(["a", "b", "c", "d"]), [
      row("a", "completed", 100),
    ]);
    expect(r.percent).toBe(25);
    expect(r.status).toBe("in_progress");
    expect(r.completedUnits).toBe(1);
  });

  it("two completed of four = 50%", () => {
    const r = calculateCredentialProgress(content(["a", "b", "c", "d"]), [
      row("a", "completed", 100),
      row("b", "completed", 100),
    ]);
    expect(r.percent).toBe(50);
  });

  it("one 50%-progress unit + three unstarted = 13% (documented rounding of 12.5)", () => {
    const r = calculateCredentialProgress(content(["a", "b", "c", "d"]), [
      row("a", "in_progress", 50),
    ]);
    expect(r.percent).toBe(13); // Math.round(12.5) — ties up
    expect(r.status).toBe("in_progress");
    expect(r.completedUnits).toBe(0);
  });

  it("all complete = 100% and Completed at every level", () => {
    const ids = ["a", "b"];
    const r = calculateCredentialProgress(content(ids, { sub2: ["c", "d"] }), [
      row("a", "completed", 100),
      row("b", "completed", 100),
      row("c", "completed", 100),
      row("d", "completed", 100),
    ]);
    expect(r.percent).toBe(100);
    expect(r.status).toBe("completed");
    expect(r.sections[0]!.status).toBe("completed");
    expect(r.sections[0]!.subsections.every((s) => s.status === "completed")).toBe(true);
  });

  it("progress=100 with a non-completed stored status still counts as completed", () => {
    const r = calculateCredentialProgress(content(["a", "b"]), [row("a", "in_progress", 100)]);
    expect(r.percent).toBe(50);
    expect(r.sections[0]!.subsections[0]!.units[0]!.status).toBe("completed");
  });

  it("clamps out-of-range stored progress to 0–100", () => {
    const r = calculateCredentialProgress(content(["a", "b"]), [row("a", "in_progress", 500)]);
    expect(r.percent).toBe(50); // 100 (clamped) + 0 over 2 = 50
  });

  it("ignores an obsolete row whose unit is not in the assigned revision", () => {
    const r = calculateCredentialProgress(content(["a", "b"]), [
      row("a", "completed", 100),
      row("ghost", "completed", 100), // not in content → ignored
    ]);
    expect(r.percent).toBe(50);
    expect(r.totalUnits).toBe(2);
  });

  it("counts a unit id only once even if it appears twice in the document", () => {
    const dup = content(["a", "a", "b"]); // malformed duplicate id
    const r = calculateCredentialProgress(dup, [row("a", "completed", 100)]);
    expect(r.totalUnits).toBe(2); // a (once) + b
    expect(r.percent).toBe(50);
  });

  it("never divides by zero for an empty content structure", () => {
    const empty = { schemaVersion: 1, sections: [] } as unknown as ContentDocument;
    const r = calculateCredentialProgress(empty, []);
    expect(r.percent).toBe(0);
    expect(r.totalUnits).toBe(0);
    expect(r.status).toBe("not_started");
  });

  it("section % is the mean over ALL its units, not a mean of subsection means", () => {
    // Sub1 has 3 units (1 complete → sub1=33), Sub2 has 1 unit (complete → sub2=100).
    // Mean of subsection means would be 66.5; the correct section % is mean over all
    // 4 units = (100+0+0+100)/4 = 50.
    const r = calculateCredentialProgress(content(["a", "b", "c"], { sub2: ["d"] }), [
      row("a", "completed", 100),
      row("d", "completed", 100),
    ]);
    expect(r.sections[0]!.percent).toBe(50);
    expect(r.percent).toBe(50);
  });
});
