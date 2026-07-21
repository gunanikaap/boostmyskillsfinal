import Link from "next/link";
import type { ProgrammeProgress } from "@/lib/programmes/progress";

/**
 * Learner programme aggregate progress (US-L-14). Status is conveyed by text +
 * percentage (not colour alone). A hidden programme, or a hidden member
 * credential, stays visible as read-only "Temporarily unavailable" with no
 * Open link, preserving the last calculated progress.
 */
export function ProgrammeProgressList({ programmes }: { programmes: ProgrammeProgress[] }) {
  if (programmes.length === 0) return null;
  return (
    <section style={{ marginTop: 8 }}>
      <h2>Your programmes</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {programmes.map((p) => (
          <div key={p.programmeEnrollmentId} className="card" data-programme-hidden={p.hidden}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 4px" }}>{p.title}</h3>
                <p
                  role="status"
                  aria-label={`Programme progress: ${p.aggregatePercent}% complete, ${p.completedCount} of ${p.totalCount} credentials completed`}
                  style={{ margin: 0, color: "var(--bms-muted)" }}
                >
                  Programme progress: <strong>{p.aggregatePercent}%</strong> · {p.completedCount} of{" "}
                  {p.totalCount} credentials completed
                </p>
              </div>
              {p.hidden ? (
                <span style={{ color: "#a15", fontWeight: 600 }}>Temporarily unavailable</span>
              ) : (
                <Link className="btn" href={`/programs/${p.slug}`}>
                  Open programme
                </Link>
              )}
            </div>
            <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {p.members.map((m) => (
                <li key={m.enrollmentId} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{m.code}</span> — {m.title} ·{" "}
                  <span style={{ color: "var(--bms-muted)" }}>{m.percent}%</span>{" "}
                  {p.hidden || m.hidden ? (
                    <em style={{ color: "#a15" }}>(temporarily unavailable)</em>
                  ) : (
                    <Link href={`/learn/${m.credentialId}`}>
                      {m.percent > 0 ? "Resume" : "Open"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
