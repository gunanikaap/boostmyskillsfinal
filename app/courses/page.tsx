import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CoursesCatalogue from "@/components/CoursesCatalogue";
import { listPublishedCredentials } from "@/lib/catalogue/queries";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { isSignedIn } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Micro-credentials" };

export default async function CoursesPage() {
  await enforceMaintenanceForPage();
  const credentials = await listPublishedCredentials();
  const signedIn = await isSignedIn();
  return (
    <>
      <SiteHeader />
      <main>
        <div className="container page-head">
          <p className="crumb">
            <Link href="/">Home</Link> / Micro-credentials
          </p>
          <h1>Micro-credentials</h1>
        </div>
        {credentials.length === 0 ? (
          <div className="container">
            <div className="empty-state">No published micro-credentials yet.</div>
          </div>
        ) : (
          <CoursesCatalogue items={credentials} signedIn={signedIn} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
