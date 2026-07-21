import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getLearnerContent } from "@/lib/player/service";
import { getEnrollmentUnitState } from "@/lib/learner/queries";
import { getCredentialProgress } from "@/lib/progress/queries";
import { AccessError } from "@/lib/access/errors";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { UnitView } from "./UnitView";
import { LevelStatus } from "./LevelStatus";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  await enforceMaintenanceForPage();
  const { credentialId } = await params;
  const user = await getCurrentAppUser();
  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="container" style={{ paddingTop: 32 }}>
          <p>
            Please <Link href="/sign-in">sign in</Link> to access this course.
          </p>
        </main>
      </>
    );
  }

  let content;
  let enrollmentId: string;
  try {
    const res = await getLearnerContent(user.id, credentialId);
    content = res.content;
    enrollmentId = res.enrollmentId;
  } catch (err) {
    if (err instanceof AccessError && (err.kind === "hidden" || err.kind === "not_found")) {
      // Hidden/draft/missing are indistinguishable — do not leak.
      notFound();
    }
    // Not enrolled → send to the public detail to enrol.
    return (
      <>
        <SiteHeader />
        <main className="container" style={{ paddingTop: 32 }}>
          <p>You are not enrolled in this credential.</p>
          <Link href="/courses">Browse micro-credentials</Link>
        </main>
      </>
    );
  }

  const stateMap = await getEnrollmentUnitState(enrollmentId);
  const progress = await getCredentialProgress(enrollmentId);
  const sectionProgress = new Map((progress?.sections ?? []).map((s) => [s.id, s]));
  const subProgress = new Map(
    (progress?.sections ?? []).flatMap((s) => s.subsections.map((ss) => [ss.id, ss] as const)),
  );

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </p>
        {progress && (
          <div
            className="card"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
          >
            <strong>Overall progress</strong>
            <LevelStatus
              status={progress.status}
              percent={progress.percent}
              srLabel="Overall credential"
            />
            <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>
              {progress.completedUnits} of {progress.totalUnits} units completed
            </span>
          </div>
        )}
        {content.sections.map((section) => {
          const sp = sectionProgress.get(section.id);
          return (
            <section key={section.id} style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <h2 style={{ margin: "12px 0" }}>{section.title}</h2>
                {sp && (
                  <LevelStatus
                    status={sp.status}
                    percent={sp.percent}
                    srLabel={`Section ${section.title}`}
                  />
                )}
              </div>
              {section.subsections.map((sub) => {
                const ssp = subProgress.get(sub.id);
                return (
                  <div key={sub.id} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                      }}
                    >
                      <h3 style={{ color: "var(--bms-muted)", margin: "6px 0" }}>{sub.title}</h3>
                      {ssp && (
                        <LevelStatus
                          status={ssp.status}
                          percent={ssp.percent}
                          srLabel={`Subsection ${sub.title}`}
                        />
                      )}
                    </div>
                    {sub.units.map((unit) => (
                      <UnitView
                        key={unit.id}
                        credentialId={credentialId}
                        unit={{ id: unit.id, type: unit.type, title: unit.title, data: unit.data }}
                        state={stateMap[unit.id]}
                      />
                    ))}
                  </div>
                );
              })}
            </section>
          );
        })}
      </main>
    </>
  );
}
