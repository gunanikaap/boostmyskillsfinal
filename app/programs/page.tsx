import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { listPublishedProgrammes } from "@/lib/catalogue/queries";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Micro-programmes" };

export default async function ProgramsPage() {
  await enforceMaintenanceForPage();
  const programmes = await listPublishedProgrammes();
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h1>Micro-programmes</h1>
        {programmes.length === 0 ? (
          <p style={{ color: "var(--bms-muted)" }}>No published micro-programmes yet.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              marginTop: 20,
            }}
          >
            {programmes.map((p) => (
              <Link
                key={p.id}
                href={`/programs/${p.slug}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <p style={{ fontSize: 12, color: "var(--bms-green)", fontWeight: 700 }}>
                  {p.organisationName}
                </p>
                <h3 style={{ margin: "6px 0" }}>{p.title}</h3>
                <p style={{ color: "var(--bms-muted)", fontSize: 14 }}>
                  {p.shortDescription ?? ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
