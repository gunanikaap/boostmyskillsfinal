import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { getLearnerContent } from "@/lib/player/service";
import { getEnrollmentUnitState } from "@/lib/learner/queries";
import { AccessError } from "@/lib/access/errors";
import { UnitView } from "./UnitView";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
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

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
        <p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </p>
        {content.sections.map((section) => (
          <section key={section.id} style={{ marginBottom: 24 }}>
            <h2>{section.title}</h2>
            {section.subsections.map((sub) => (
              <div key={sub.id} style={{ marginBottom: 12 }}>
                <h3 style={{ color: "var(--bms-muted)" }}>{sub.title}</h3>
                {sub.units.map((unit) => (
                  <UnitView
                    key={unit.id}
                    credentialId={credentialId}
                    unit={{ id: unit.id, type: unit.type, title: unit.title, data: unit.data }}
                    state={stateMap[unit.id]}
                  />
                ))}
              </div>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}
