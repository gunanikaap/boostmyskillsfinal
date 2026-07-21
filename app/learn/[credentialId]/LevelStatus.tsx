import type { ProgressStatus } from "@/lib/progress/calculate";

const LABEL: Record<ProgressStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const TONE: Record<ProgressStatus, string> = {
  not_started: "var(--bms-muted)",
  in_progress: "#0a6",
  completed: "var(--bms-green)",
};

/**
 * Accessible completion-status indicator for a Section / Subsection / Unit.
 * Status is conveyed by TEXT (not colour alone): a visible label + percentage,
 * an aria-label for screen readers, and a thin progress bar. Values always come
 * from the canonical progress calculation.
 */
export function LevelStatus({
  status,
  percent,
  srLabel,
}: {
  status: ProgressStatus;
  percent: number;
  /** Unique screen-reader prefix, e.g. "Section Introduction" / "Overall credential". */
  srLabel: string;
}) {
  const label = LABEL[status];
  return (
    <span
      role="status"
      aria-label={`${srLabel}: ${label}, ${percent}% complete`}
      data-status={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        maxWidth: "100%",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: TONE[status] }}>
        {label} · {percent}%
      </span>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 96,
          maxWidth: "40vw",
          height: 6,
          borderRadius: 999,
          background: "var(--bms-border)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${percent}%`,
            height: "100%",
            background: TONE[status],
          }}
        />
      </span>
    </span>
  );
}
