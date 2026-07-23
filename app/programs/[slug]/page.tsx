import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getCachedPublishedProgrammeBySlug } from "@/lib/catalogue/cache";
import { RegisterButton } from "./RegisterButton";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { signInHref } from "@/lib/auth/session";
import { getMyProgrammeState } from "@/lib/enrolments/service";
import { getCurrentAppUser } from "@/lib/auth/appUser";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getCachedPublishedProgrammeBySlug(slug);
  if (!detail) return { title: "Not found" };
  return { title: detail.title, description: detail.shortDescription ?? undefined };
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await enforceMaintenanceForPage();
  const { slug } = await params;
  const detail = await getCachedPublishedProgrammeBySlug(slug);
  if (!detail) notFound();

  const about = (detail.aboutContent as { html?: string } | null)?.html ?? "";
  const count = detail.credentials.length;
  const user = await getCurrentAppUser();
  const signedIn = user !== null;
  const { registered, completed } = user
    ? await getMyProgrammeState(user.id, detail.id)
    : { registered: false, completed: false };

  return (
    <>
      <SiteHeader />
      <main className="container course-detail">
        <p className="crumb">
          <Link href="/programs">Micro-programmes</Link> / {detail.title}
        </p>

        {/* Hero: illustration (left) + title / author / register (right) */}
        <section className={`course-hero${detail.bannerObjectKey ? "" : " course-hero--noart"}`}>
          {detail.bannerObjectKey && (
            <div className="course-hero__art">
              {/* Served through the controlled /media route (published banners are public). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${detail.bannerObjectKey}`} alt={`${detail.title} banner`} />
            </div>
          )}
          <div className="course-hero__text">
            <p className="course-hero__eyebrow">Micro-programme</p>
            <h1>{detail.title}</h1>
            <div className="course-hero__cta">
              <RegisterButton
                programmeId={detail.id}
                signedIn={signedIn}
                registered={registered}
                completed={completed}
                signInHref={signInHref(`/programs/${detail.slug}`)}
              />
            </div>
          </div>
        </section>

        {/* Content: about + members (left) + facts sidebar (right) */}
        <section className="course-body">
          <article>
            {/* about_content is sanitised at write time */}
            <div className="course-about" dangerouslySetInnerHTML={{ __html: about }} />

            {count > 0 && (
              <div className="programme-members">
                <h2>Included micro-credentials</h2>
                <ol className="programme-members__list">
                  {detail.credentials.map((c, i) => (
                    <li key={c.id}>
                      <Link href={`/courses/${c.slug}`} className="programme-member">
                        <span className="programme-member__num">{i + 1}</span>
                        <span className="programme-member__body">
                          <span className="programme-member__title">{c.title}</span>
                          <span className="programme-member__meta">
                            {c.code} &middot; {c.organisationName}
                          </span>
                        </span>
                        <span className="programme-member__arrow">
                          <Arrow />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>

          <aside className="course-detail__side">
            <div className="course-facts">
              <div className="course-fact">
                <dt>Project</dt>
                <dd>{detail.projectName}</dd>
              </div>
              <div className="course-fact">
                <dt>Micro-credentials</dt>
                <dd>
                  {count} included course{count === 1 ? "" : "s"}
                </dd>
              </div>
            </div>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
