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
    <section className="dash-section">
      <h2>Your programmes</h2>
      <div className="dash-grid dash-grid--wide">
        {programmes.map((p) => (
          <div
            key={p.programmeEnrollmentId}
            className="dash-card dash-prog"
            data-programme-hidden={p.hidden}
          >
            <div className="dash-prog__head">
              <div>
                <h3 className="dash-card__title">{p.title}</h3>
                <p
                  className="dash-card__pct"
                  role="status"
                  aria-label={`Programme progress: ${p.aggregatePercent}% complete, ${p.completedCount} of ${p.totalCount} credentials completed`}
                >
                  <strong style={{ color: "var(--bms-ink)" }}>{p.aggregatePercent}%</strong> ·{" "}
                  {p.completedCount} of {p.totalCount} credentials completed
                </p>
              </div>
              {p.hidden ? (
                <span className="dash-unavailable">Temporarily unavailable</span>
              ) : (
                <Link className="btn btn-outline" href={`/programs/${p.slug}`}>
                  Open programme
                </Link>
              )}
            </div>

            <div className="pbar" aria-hidden="true">
              <span style={{ width: `${p.aggregatePercent}%` }} />
            </div>

            <ul className="dash-prog__members">
              {p.members.map((m) => (
                <li key={m.enrollmentId} className="dash-member">
                  <span className="dash-member__title">
                    <strong>{m.code}</strong> {m.title}
                  </span>
                  <span className="dash-member__pct">{m.percent}%</span>
                  {p.hidden || m.hidden ? (
                    <em className="dash-unavailable">unavailable</em>
                  ) : (
                    <Link href={`/learn/${m.credentialId}`} className="dash-member__link">
                      {m.percent > 0 ? "Resume" : "Open"} →
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
