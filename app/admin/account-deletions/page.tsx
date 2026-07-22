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

  return (
    <div>
      <div className="admin-head">
        <h1>Account deletion requests</h1>
        <p className="admin-head__sub">
          {pendingCount} pending · {requests.length} total. Approving a request closes the account;
          rejecting leaves it active.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="empty-state">No account deletion requests yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Requested</th>
                <th>User</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="admin-table__muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(r.requestedAt).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.fullName || r.username || "—"}</div>
                    <div className="admin-table__muted" style={{ fontSize: 13 }}>
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                    </div>
                  </td>
                  <td style={{ whiteSpace: "pre-wrap", maxWidth: 320 }}>
                    {r.reason || <span className="admin-table__muted">—</span>}
                    {r.adminNote && (
                      <div className="admin-table__muted" style={{ marginTop: 6, fontSize: 13 }}>
                        <strong>Admin note:</strong> {r.adminNote}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{STATUS_LABEL[r.status]}</td>
                  <td>
                    {r.status === "pending" ? (
                      <DeletionActions requestId={r.id} />
                    ) : (
                      <span className="admin-table__muted">—</span>
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
