import { listSubmissions } from "@/lib/contact/store";

export const dynamic = "force-dynamic";

// Access is enforced by the /admin layout's requireAdmin() gate (the same gate
// every other admin page relies on); this page just reads and renders.
export default async function AdminContactPage() {
  const submissions = await listSubmissions();

  const cell: React.CSSProperties = {
    borderBottom: "1px solid var(--bms-border)",
    padding: "10px 12px",
    verticalAlign: "top",
    textAlign: "left",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>Contact messages</h1>
        <p style={{ color: "var(--bms-muted)", margin: "6px 0 0" }}>
          {submissions.length} message{submissions.length === 1 ? "" : "s"} submitted via the
          contact form.
        </p>
      </div>

      {submissions.length === 0 ? (
        <p className="empty-state">No contact messages yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...cell, whiteSpace: "nowrap" }}>Received</th>
                <th style={cell}>Name</th>
                <th style={cell}>Email</th>
                <th style={cell}>Message</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--bms-muted)" }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {`${s.firstName} ${s.lastName}`.trim()}
                  </td>
                  <td style={cell}>
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </td>
                  <td style={{ ...cell, whiteSpace: "pre-wrap" }}>{s.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
