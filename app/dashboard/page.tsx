import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { listMyLearning } from "@/lib/learner/queries";
import { listMyProgrammeProgress } from "@/lib/programmes/progress";
import { ProgrammeProgressList } from "./ProgrammeProgressList";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await enforceMaintenanceForPage();
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="container" style={{ paddingTop: 32 }}>
          <h1>Your learning</h1>
          <p>
            Please <Link href="/sign-in">sign in</Link> to see your enrolments.
          </p>
        </main>
      </>
    );
  }
  const items = await listMyLearning(user.id);
  const programmes = await listMyProgrammeProgress(user.id);
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h1>Your learning</h1>
        <p>
          <Link href="/account/certificates">View your certificates</Link>
        </p>
        <ProgrammeProgressList programmes={programmes} />
        {items.length > 0 && <h2 style={{ marginTop: 24 }}>Your credentials</h2>}
        {items.length === 0 ? (
          <p style={{ color: "var(--bms-muted)" }}>
            You are not enrolled in anything yet.{" "}
            <Link href="/courses">Browse micro-credentials</Link>.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {items.map((it) => (
              <div key={it.enrollmentId} className="card">
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--bms-green)",
                        fontWeight: 700,
                        margin: 0,
                      }}
                    >
                      {it.code}
                    </p>
                    <h3 style={{ margin: "4px 0" }}>{it.title}</h3>
                    <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                      Progress: {it.progressPercent}%
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {it.hidden ? (
                      <span style={{ color: "#a15", fontWeight: 600 }}>
                        Temporarily unavailable
                      </span>
                    ) : (
                      <Link className="btn" href={`/learn/${it.credentialId}`}>
                        {it.progressPercent > 0 ? "Resume" : "Start"}
                      </Link>
                    )}
                    {it.hasCertificate && (
                      <p style={{ marginTop: 8 }}>
                        <Link href="/account/certificates">Certificate ✓</Link>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
