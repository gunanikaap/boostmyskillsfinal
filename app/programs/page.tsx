import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { ProgrammeCard } from "@/components/CatalogueCards";
import { listPublishedProgrammesWithMembers } from "@/lib/catalogue/queries";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { isSignedIn } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Micro-programmes" };

export default async function ProgramsPage() {
  await enforceMaintenanceForPage();
  const programmes = await listPublishedProgrammesWithMembers();
  const signedIn = await isSignedIn();
  return (
    <>
      <SiteHeader />
      <main>
        <div className="container page-head">
          <p className="crumb">
            <Link href="/">Home</Link> / Micro-programmes
          </p>
          <h1>Micro-programmes</h1>
        </div>
        <div className="container">
          {programmes.length === 0 ? (
            <div className="empty-state">No published micro-programmes yet.</div>
          ) : (
            <>
              <p className="result-count" style={{ marginTop: 8 }}>
                {programmes.length} {programmes.length === 1 ? "programme" : "programmes"}
              </p>
              <div className="catalogue-grid">
                {programmes.map((p, i) => (
                  <ProgrammeCard key={p.id} p={p} i={i} signedIn={signedIn} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
