import { adminEnrolmentAnalytics } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const rows = await adminEnrolmentAnalytics({});
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Enrolment analytics</h1>
        <a className="btn" href="/admin/analytics/export">
          Export CSV
        </a>
      </div>
      <p style={{ color: "var(--bms-muted)", margin: 0 }}>
        Showing all credential enrolments. Filtering (project / programme / credential / date range)
        is available on the export endpoint via query parameters.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--bms-border)" }}>
            <th style={{ padding: 6 }}>Learner</th>
            <th style={{ padding: 6 }}>Credential</th>
            <th style={{ padding: 6 }}>Progress</th>
            <th style={{ padding: 6 }}>Completed</th>
            <th style={{ padding: 6 }}>Result</th>
            <th style={{ padding: 6 }}>Enrolled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--bms-border)" }}>
              <td style={{ padding: 6 }}>{r.learnerName}</td>
              <td style={{ padding: 6 }}>
                {r.credentialCode} — {r.credentialTitle}
              </td>
              <td style={{ padding: 6 }}>{r.progressPercent}%</td>
              <td style={{ padding: 6 }}>{r.completed ? "yes" : "no"}</td>
              <td style={{ padding: 6 }}>
                {r.passed === null ? "—" : r.passed ? `pass (${r.finalPercentage ?? ""}%)` : "fail"}
              </td>
              <td style={{ padding: 6 }}>{r.enrolledAt.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 12, color: "var(--bms-muted)" }}>
                No enrolments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
