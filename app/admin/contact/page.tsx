import { listSubmissions } from "@/lib/contact/store";

export const dynamic = "force-dynamic";

// Access is enforced by the /admin layout's requireAdmin() gate (the same gate
// every other admin page relies on); this page just reads and renders.
export default async function AdminContactPage() {
  const submissions = await listSubmissions();

  return (
    <div>
      <div className="admin-head">
        <h1>Contact messages</h1>
        <p className="admin-head__sub">
          {submissions.length} message{submissions.length === 1 ? "" : "s"} submitted via the
          contact form.
        </p>
      </div>

      {submissions.length === 0 ? (
        <p className="empty-state">No contact messages yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Received</th>
                <th>Name</th>
                <th>Email</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td className="admin-table__muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{`${s.firstName} ${s.lastName}`.trim()}</td>
                  <td>
                    <a href={`mailto:${s.email}`}>{s.email}</a>
                  </td>
                  <td style={{ whiteSpace: "pre-wrap" }}>{s.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
