import type { ContentDocument } from "@/lib/content/schema";

/**
 * Canonical credential-progress calculation.
 *
 * The SINGLE source of truth for learner progress, used by the dashboard, the
 * player hierarchy status, programme aggregate progress, admin analytics and the
 * CSV export. It calculates against EVERY unit in the learner's assigned
 * `content_document` — a missing `unit_progress` row counts as not_started/0, so
 * unstarted units are never silently dropped (the old `AVG(progress_percent)` over
 * existing rows over-reported, e.g. 100% when only 1 of 4 units had a row).
 *
 * Determinism + revision-binding: the caller passes the enrolment's bound
 * `content_document`, so publishing a new revision never changes an existing
 * enrolment's calculated progress.
 *
 * Rounding policy (documented, applied everywhere): each aggregate percentage is
 * the arithmetic mean of its units' percentages, rounded to the NEAREST INTEGER
 * with ties rounded up (JavaScript `Math.round`). Unit percentages are already
 * integers in 0–100.
 */

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export interface UnitProgressRow {
  unitId: string;
  status: string;
  progressPercent: number;
}

export interface UnitProgressView {
  unitId: string;
  title: string;
  type: string;
  status: ProgressStatus;
  percent: number;
}

export interface SubsectionProgressView {
  id: string;
  title: string;
  status: ProgressStatus;
  percent: number;
  units: UnitProgressView[];
}

export interface SectionProgressView {
  id: string;
  title: string;
  status: ProgressStatus;
  percent: number;
  subsections: SubsectionProgressView[];
}

export interface CredentialProgressView {
  percent: number;
  status: ProgressStatus;
  totalUnits: number;
  completedUnits: number;
  sections: SectionProgressView[];
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** The documented rounding policy: nearest integer, ties up. */
export function roundPercent(mean: number): number {
  return Math.round(mean);
}

function unitView(
  unit: { id: string; title: string; type: string },
  row: UnitProgressRow | undefined,
): UnitProgressView {
  const clamped = row ? clamp(row.progressPercent) : 0;
  const completed = row?.status === "completed" || clamped === 100;
  const status: ProgressStatus = completed
    ? "completed"
    : clamped > 0
      ? "in_progress"
      : "not_started";
  return {
    unitId: unit.id,
    title: unit.title,
    type: unit.type,
    status,
    percent: completed ? 100 : clamped,
  };
}

/** Aggregate a flat list of units into a percentage + rolled-up status. */
function aggregate(units: UnitProgressView[]): { percent: number; status: ProgressStatus } {
  if (units.length === 0) return { percent: 0, status: "not_started" }; // never divide by zero
  const percent = roundPercent(units.reduce((s, u) => s + u.percent, 0) / units.length);
  const allCompleted = units.every((u) => u.status === "completed");
  const allNotStarted = units.every((u) => u.status === "not_started");
  const status: ProgressStatus = allCompleted
    ? "completed"
    : allNotStarted
      ? "not_started"
      : "in_progress";
  return { percent, status };
}

/**
 * Calculate the full progress hierarchy for one enrolment.
 * @param content the enrolment's ASSIGNED content_document (not the latest).
 * @param rows the enrolment's unit_progress rows (any missing unit = 0).
 */
export function calculateCredentialProgress(
  content: ContentDocument,
  rows: UnitProgressRow[],
): CredentialProgressView {
  const rowByUnit = new Map<string, UnitProgressRow>();
  for (const r of rows) if (!rowByUnit.has(r.unitId)) rowByUnit.set(r.unitId, r);

  const seen = new Set<string>(); // a unit id is never counted twice
  const allUnits: UnitProgressView[] = [];
  const sections: SectionProgressView[] = [];

  for (const section of content.sections ?? []) {
    const sectionUnits: UnitProgressView[] = [];
    const subsections: SubsectionProgressView[] = [];
    for (const sub of section.subsections ?? []) {
      const subUnits: UnitProgressView[] = [];
      for (const u of sub.units ?? []) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        const v = unitView(u, rowByUnit.get(u.id));
        subUnits.push(v);
        sectionUnits.push(v);
        allUnits.push(v);
      }
      const agg = aggregate(subUnits);
      subsections.push({ id: sub.id, title: sub.title, units: subUnits, ...agg });
    }
    const agg = aggregate(sectionUnits);
    sections.push({ id: section.id, title: section.title, subsections, ...agg });
  }

  const credAgg = aggregate(allUnits);
  return {
    percent: credAgg.percent,
    status: credAgg.status,
    totalUnits: allUnits.length,
    completedUnits: allUnits.filter((u) => u.status === "completed").length,
    sections,
  };
}
