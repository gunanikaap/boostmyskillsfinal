import { listDeletionRequests, type DeletionStatus } from "@/lib/account/deletion";
import { DeletionActions } from "./DeletionActions";

export const dynamic = "force-dynamic";

// Access is enforced by the /admin layout's requireAdmin() gate.
const STATUS_LABEL: Record<DeletionStatus, string> = {
  pending: "Pending",
  approved: "Approved (account closed)",
  rejected: "Rejected",
  cancelled: "Withdrawn by user",
};

export default async function AdminAccountDeletionsPage() {
  const requests = await listDeletionRequests();
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const cell: React.CSSProperties = {
    borderBottom: "1px solid var(--bms-border)",
    padding: "12px",
    verticalAlign: "top",
    textAlign: "left",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>Account deletion requests</h1>
        <p style={{ color: "var(--bms-muted)", margin: "6px 0 0" }}>
          {pendingCount} pending · {requests.length} total. Approving a request closes the account;
          rejecting leaves it active.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="empty-state">No account deletion requests yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...cell, whiteSpace: "nowrap" }}>Requested</th>
                <th style={cell}>User</th>
                <th style={cell}>Reason</th>
                <th style={cell}>Status</th>
                <th style={cell}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...cell, whiteSpace: "nowrap", color: "var(--bms-muted)" }}>
                    {new Date(r.requestedAt).toLocaleString()}
                  </td>
                  <td style={cell}>
                    <div style={{ fontWeight: 600 }}>{r.fullName || r.username || "—"}</div>
                    <div style={{ color: "var(--bms-muted)", fontSize: 13 }}>
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                    </div>
                  </td>
                  <td style={{ ...cell, whiteSpace: "pre-wrap", maxWidth: 320 }}>
                    {r.reason || <span style={{ color: "var(--bms-muted)" }}>—</span>}
                    {r.adminNote && (
                      <div style={{ marginTop: 6, fontSize: 13, color: "var(--bms-muted)" }}>
                        <strong>Admin note:</strong> {r.adminNote}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{STATUS_LABEL[r.status]}</td>
                  <td style={cell}>
                    {r.status === "pending" ? (
                      <DeletionActions requestId={r.id} />
                    ) : (
                      <span style={{ color: "var(--bms-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
