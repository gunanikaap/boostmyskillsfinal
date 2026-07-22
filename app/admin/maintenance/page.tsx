import { getMaintenance } from "@/lib/settings/maintenance";
import { MaintenanceToggle } from "./MaintenanceToggle";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  const m = await getMaintenance();
  return (
    <div>
      <div className="admin-head">
        <h1>Maintenance mode</h1>
        <p className="admin-head__sub">
          When enabled, everyone except admins is redirected to the maintenance page — only the home
          page and the sign-in page stay open, and protected writes are rejected server-side. No
          redeployment is required.
        </p>
      </div>

      <MaintenanceToggle initialEnabled={m.maintenanceMode} initialMessage={m.maintenanceMessage} />

      {m.updatedBy && (
        <p className="admin-table__muted" style={{ marginTop: 16 }}>
          Last updated by admin {String(m.updatedBy)}.
        </p>
      )}
    </div>
  );
}
