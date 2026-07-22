import {
  adminEnrolmentAnalytics,
  analyticsFilterOptions,
  summariseAnalytics,
  type AnalyticsFilter,
} from "@/lib/admin/analytics";
import AnalyticsFilters from "./AnalyticsFilters";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter: AnalyticsFilter = {
    userId: first(sp.userId),
    organisationName: first(sp.organisation),
    projectId: first(sp.projectId),
    programmeId: first(sp.programmeId),
    credentialId: first(sp.credentialId),
    from: first(sp.from),
    to: first(sp.to),
  };

  const [rows, options] = await Promise.all([
    adminEnrolmentAnalytics(filter),
    analyticsFilterOptions(),
  ]);
  const summary = summariseAnalytics(rows);

  // Query string of the active filters (param key for organisation is `organisation`).
  const params = new URLSearchParams();
  const map: Record<string, string | undefined> = {
    userId: filter.userId,
    organisation: filter.organisationName,
    projectId: filter.projectId,
    programmeId: filter.programmeId,
    credentialId: filter.credentialId,
    from: filter.from,
    to: filter.to,
  };
  for (const [k, v] of Object.entries(map)) if (v) params.set(k, v);
  const qs = params.toString();
  const exportHref = qs ? `/admin/analytics/export?${qs}` : "/admin/analytics/export";

  const current = {
    userId: filter.userId,
    organisation: filter.organisationName,
    projectId: filter.projectId,
    programmeId: filter.programmeId,
    credentialId: filter.credentialId,
    from: filter.from,
    to: filter.to,
  };

  return (
    <div>
      <div className="admin-head">
        <h1>Enrolment analytics</h1>
        <p className="admin-head__sub">
          Filter by learner, organisation, project, micro-programme, micro-credential and enrolment
          date. The summary figures and the CSV export both reflect your current filters.
        </p>
      </div>

      <AnalyticsFilters key={qs} options={options} current={current} />

      <div className="admin-metrics">
        <Metric label="Enrolments" value={summary.enrolments} />
        <Metric label="Learners" value={summary.learners} />
        <Metric label="Completed" value={summary.completed} sub={`${summary.completionRate}%`} />
        <Metric label="Avg. progress" value={`${summary.averageProgress}%`} />
        <Metric
          label="Passed"
          value={`${summary.passed}/${summary.graded}`}
          sub={`${summary.passRate}% of graded`}
        />
      </div>

      <div className="admin-analytics__bar">
        <span className="admin-table__muted">
          {qs ? "Filtered" : "All"} results — {rows.length} enrolment{rows.length === 1 ? "" : "s"}
        </span>
        <a className="btn" href={exportHref}>
          Export CSV
        </a>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="admin-table" style={{ minWidth: 940 }}>
          <thead>
            <tr>
              <th>Learner</th>
              <th>Organisation</th>
              <th>Credential</th>
              <th>Progress</th>
              <th>Completed</th>
              <th>Result</th>
              <th>Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{r.learnerName}</td>
                <td>{r.organisationName}</td>
                <td>
                  {r.credentialCode} — {r.credentialTitle}
                  <div className="admin-table__muted" style={{ fontSize: 13 }}>
                    {r.projectName}
                  </div>
                </td>
                <td>{r.progressPercent}%</td>
                <td>{r.completed ? "yes" : "no"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.passed === null
                    ? "—"
                    : r.passed
                      ? `pass (${r.finalPercentage ?? ""}%)`
                      : "fail"}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{r.enrolledAt.slice(0, 10)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="admin-table__muted" style={{ padding: 16 }}>
                  No enrolments match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="admin-metric">
      <span className="admin-metric__num">{value}</span>
      <span className="admin-metric__label">{label}</span>
      {sub && <span className="admin-metric__sub">{sub}</span>}
    </div>
  );
}
