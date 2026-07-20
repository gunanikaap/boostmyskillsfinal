import { getMaintenance } from "@/lib/settings/maintenance";
import { MaintenanceToggle } from "./MaintenanceToggle";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  const m = await getMaintenance();
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Maintenance mode</h1>
      <p style={{ color: "var(--bms-muted)" }}>
        When enabled, non-admin access to every page except the home page is replaced by the
        maintenance page, and protected writes are rejected server-side. Admins retain full access.
        No redeployment is required.
      </p>
      <MaintenanceToggle initialEnabled={m.maintenanceMode} initialMessage={m.maintenanceMessage} />
      {m.updatedBy && (
        <p style={{ color: "var(--bms-muted)" }}>Last updated by admin {String(m.updatedBy)}.</p>
      )}
    </div>
  );
}
