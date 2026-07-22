import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getLearnerContent } from "@/lib/player/service";
import { getEnrollmentUnitState, getMcqReview } from "@/lib/learner/queries";
import { getCredentialProgress } from "@/lib/progress/queries";
import { computeCredentialResult, getEnrollmentCertificate } from "@/lib/certificates/service";
import { AccessError } from "@/lib/access/errors";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { UnitView } from "./UnitView";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  reading: "Reading",
  video: "Video",
  pdf: "PDF",
  mcq: "Quiz",
};

function UnitIcon({ status }: { status?: string }) {
  if (status === "completed") {
    return (
      <span className="player__unit-icon player__unit-icon--done" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  const inProgress = status === "in_progress";
  return (
    <span
      className={`player__unit-icon${inProgress ? " player__unit-icon--active" : ""}`}
      aria-hidden="true"
    />
  );
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ credentialId: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  await enforceMaintenanceForPage();
  const { credentialId } = await params;
  const { unit: requestedUnit } = await searchParams;
  const user = await getCurrentAppUser();
  // A deactivated account has no learner access — send it to the closure notice.
  if (user?.deactivated) redirect("/account");
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
      notFound();
    }
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

  // Flatten every unit into a single ordered lesson list.
  const flat = content.sections.flatMap((section) =>
    section.subsections.flatMap((sub) =>
      sub.units.map((unit) => ({ unit, sectionTitle: section.title, subTitle: sub.title })),
    ),
  );

  if (flat.length === 0) {
    return (
      <>
        <SiteHeader />
        <main className="container" style={{ paddingTop: 32 }}>
          <p>This course has no content yet.</p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </main>
      </>
    );
  }

  // Pick the current lesson: the requested one, else the first not-completed, else the first.
  let currentIndex = requestedUnit ? flat.findIndex((f) => f.unit.id === requestedUnit) : -1;
  if (currentIndex < 0) {
    currentIndex = flat.findIndex((f) => stateMap[f.unit.id]?.status !== "completed");
    if (currentIndex < 0) currentIndex = 0;
  }
  const current = flat[currentIndex]!;
  const prev = flat[currentIndex - 1];
  const next = flat[currentIndex + 1];
  const unitHref = (id: string) => `/learn/${credentialId}?unit=${id}`;

  // For a submitted MCQ, load the review (correct answers + the learner's choices).
  const review =
    current.unit.type === "mcq" && stateMap[current.unit.id]?.attempted
      ? await getMcqReview(enrollmentId, current.unit.id)
      : null;

  // Finish state: once every unit is done, tell the learner whether they earned
  // the certificate — or, if the pass criteria wasn't met, that they didn't.
  const contentComplete = (progress?.percent ?? 0) >= 100;
  const certificate = contentComplete ? await getEnrollmentCertificate(enrollmentId) : null;
  const result =
    contentComplete && !certificate ? await computeCredentialResult(enrollmentId) : null;

  return (
    <>
      <SiteHeader />
      <main className="container player">
        <div className="player__top">
          <Link href="/dashboard" className="crumb">
            ← Back to dashboard
          </Link>
          {progress && (
            <div className="player-progress">
              <div className="player-progress__bar">
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <span className="player-progress__label">
                {progress.percent}% · {progress.completedUnits} of {progress.totalUnits} units
              </span>
            </div>
          )}
        </div>

        <div className="player__grid">
          <aside className="player__sidebar" aria-label="Course outline">
            {content.sections.map((section) => (
              <div key={section.id} className="player__section">
                <p className="player__section-title">{section.title}</p>
                <ol className="player__units">
                  {section.subsections
                    .flatMap((sub) => sub.units)
                    .map((unit) => {
                      const active = unit.id === current.unit.id;
                      return (
                        <li key={unit.id}>
                          <Link
                            href={unitHref(unit.id)}
                            className={`player__unit${active ? " player__unit--active" : ""}`}
                            aria-current={active ? "page" : undefined}
                          >
                            <UnitIcon status={stateMap[unit.id]?.status} />
                            <span className="player__unit-title">{unit.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                </ol>
              </div>
            ))}
          </aside>

          <article className="player__main">
            {contentComplete && certificate && (
              <div className="finish-banner finish-banner--ok" role="status">
                <strong>🎉 Course complete — certificate issued!</strong>
                <p>
                  Congratulations on finishing this micro-credential.{" "}
                  <Link href="/account/certificates">View your certificate</Link>.
                </p>
              </div>
            )}
            {contentComplete && result && !result.passed && (
              <div className="finish-banner finish-banner--warn" role="status">
                <strong>Not eligible for a certificate</strong>
                <p>
                  You&rsquo;ve completed all the lessons, but the pass criteria wasn&rsquo;t met, so
                  a certificate couldn&rsquo;t be issued
                  {result.threshold > 0
                    ? ` — you scored ${result.percentage}%, and ${result.threshold}% is required`
                    : ""}
                  {!result.requiredUnitsComplete ? ", and not all required units are complete" : ""}
                  .
                </p>
              </div>
            )}
            <p className="player__crumb">
              {current.sectionTitle}
              {current.subTitle ? ` › ${current.subTitle}` : ""}
            </p>
            <div className="player__unit-head">
              <h1>{current.unit.title}</h1>
              <span className="player__type">
                {TYPE_LABEL[current.unit.type] ?? current.unit.type}
              </span>
            </div>

            <UnitView
              key={current.unit.id}
              credentialId={credentialId}
              unit={{
                id: current.unit.id,
                type: current.unit.type,
                title: current.unit.title,
                data: current.unit.data,
              }}
              state={stateMap[current.unit.id]}
              review={review}
            />

            <nav className="player__nav" aria-label="Lesson navigation">
              {prev ? (
                <Link href={unitHref(prev.unit.id)} className="btn btn-outline btn-lg">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={unitHref(next.unit.id)} className="btn btn-lg">
                  Next →
                </Link>
              ) : (
                <Link href="/dashboard" className="btn btn-lg">
                  Finish →
                </Link>
              )}
            </nav>
          </article>
        </div>
      </main>
    </>
  );
}
