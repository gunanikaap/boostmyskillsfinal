import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
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
        <main className="container dash">
          <div className="page-head">
            <h1>Your learning</h1>
          </div>
          <p className="dash-empty">
            Please <Link href="/sign-in">sign in</Link> to see your enrolments.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const items = await listMyLearning(user.id);
  const programmes = await listMyProgrammeProgress(user.id);
  const completed = items.filter((i) => i.progressPercent >= 100 || i.hasCertificate).length;
  const firstName = user.firstName?.trim();

  return (
    <>
      <SiteHeader />
      <main className="container dash">
        <div className="page-head">
          <p className="crumb">
            <Link href="/">Home</Link> / Dashboard
          </p>
          <h1>Your learning</h1>
          {firstName && <p className="dash-welcome">Welcome back, {firstName} 👋</p>}
        </div>

        <div className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat__num">{programmes.length}</span>
            <span className="dash-stat__label">Micro-programmes</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__num">{items.length}</span>
            <span className="dash-stat__label">Micro-credentials</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__num">{completed}</span>
            <span className="dash-stat__label">Completed</span>
          </div>
          <Link href="/account/certificates" className="dash-stat dash-stat--link">
            View your certificates →
          </Link>
        </div>

        <ProgrammeProgressList programmes={programmes} />

        <section className="dash-section">
          <h2>Your micro-credentials</h2>
          {items.length === 0 ? (
            <p className="dash-empty">
              You are not enrolled in anything yet.{" "}
              <Link href="/courses">Browse micro-credentials</Link>.
            </p>
          ) : (
            <div className="dash-grid">
              {items.map((it) => {
                const label =
                  it.progressPercent >= 100
                    ? "Review"
                    : it.progressPercent > 0
                      ? "Resume"
                      : "Start";
                return (
                  <div key={it.enrollmentId} className="dash-card">
                    <p className="dash-card__code">{it.code}</p>
                    <h3 className="dash-card__title">{it.title}</h3>
                    <div className="pbar" aria-hidden="true">
                      <span style={{ width: `${it.progressPercent}%` }} />
                    </div>
                    <p className="dash-card__pct">{it.progressPercent}% complete</p>
                    <div className="dash-card__foot">
                      {it.hidden ? (
                        <span className="dash-unavailable">Temporarily unavailable</span>
                      ) : (
                        <Link className="btn" href={`/learn/${it.credentialId}`}>
                          {label}
                        </Link>
                      )}
                      {it.hasCertificate && (
                        <Link href="/account/certificates" className="dash-badge">
                          ✓ Certificate
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
