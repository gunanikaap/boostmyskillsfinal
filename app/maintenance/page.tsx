import { getMaintenance } from "@/lib/settings/maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const m = await getMaintenance();
  return (
    <main className="container" style={{ paddingTop: 80, textAlign: "center", maxWidth: 640 }}>
      <p style={{ color: "var(--bms-green)", fontWeight: 700, letterSpacing: 1 }}>BOOSTMYSKILLS</p>
      <h1>We&apos;ll be right back</h1>
      <p style={{ color: "var(--bms-muted)", fontSize: 18 }}>{m.maintenanceMessage}</p>
    </main>
  );
}
