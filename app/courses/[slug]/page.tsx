import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getPublishedCredentialBySlug } from "@/lib/catalogue/queries";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";
import { EnrolButton } from "./EnrolButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getPublishedCredentialBySlug(slug);
  // Draft/hidden/missing produce no descriptive metadata (no leak).
  if (!detail) return { title: "Not found" };
  return { title: detail.title, description: detail.shortDescription ?? undefined };
}

const UNIT_LABEL: Record<string, string> = {
  reading: "Reading",
  video: "Video",
  mcq: "Quiz",
};

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function CredentialDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await enforceMaintenanceForPage();
  const { slug } = await params;
  const detail = await getPublishedCredentialBySlug(slug);
  if (!detail) notFound(); // draft/hidden are indistinguishable from missing

  const about = (detail.aboutContent as { html?: string } | null)?.html ?? "";
  // "Sections" outline: prefer the OLX-style chapter list (source_metadata), and
  // fall back to the flattened content units. Titles only — never answers.
  const sections: { title: string; label?: string }[] =
    detail.chapters.length > 0
      ? detail.chapters.map((title) => ({ title }))
      : detail.content.sections.flatMap((s) =>
          s.subsections.flatMap((ss) =>
            ss.units.map((u) => ({ title: u.title, label: UNIT_LABEL[u.type] })),
          ),
        );

  return (
    <>
      <SiteHeader />
      <main className="container course-detail">
        <p className="crumb">
          <Link href="/courses">Micro-credentials</Link> / {detail.title}
        </p>

        {/* Hero: illustration (left) + title / author / enrol (right) */}
        <section className={`course-hero${detail.bannerObjectKey ? "" : " course-hero--noart"}`}>
          {detail.bannerObjectKey && (
            <div className="course-hero__art">
              {/* Served through the controlled /media route (published banners are public). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${detail.bannerObjectKey}`} alt={`${detail.title} banner`} />
            </div>
          )}
          <div className="course-hero__text">
            <h1>{detail.title}</h1>
            <p className="course-hero__by">by {detail.organisationName}</p>
            <div className="course-hero__cta">
              <EnrolButton credentialId={detail.id} />
            </div>
          </div>
        </section>

        {/* Content: about (left) + facts / sections sidebar (right) */}
        <section className="course-body">
          {/* about_content is sanitised at write time; it may contain any number of
              <h2> blocks (Context and overview / Learning objectives / …). */}
          <article className="course-about" dangerouslySetInnerHTML={{ __html: about }} />

          <aside className="course-detail__side">
            <div className="course-facts">
              <p className="course-fact-row">
                <InfoIcon />
                <span>
                  <strong>Course Number:</strong> {detail.code} | {detail.projectName}
                </span>
              </p>
              {detail.duration && (
                <p className="course-fact-row">
                  <ClockIcon />
                  <span>{detail.duration}</span>
                </p>
              )}
              {detail.studyTime && (
                <p className="course-fact-row">
                  <HourglassIcon />
                  <span>
                    <strong>Study time:</strong> {detail.studyTime}
                  </span>
                </p>
              )}
            </div>

            {sections.length > 0 && (
              <div className="course-sections">
                <h2>Sections</h2>
                <ol>
                  {sections.map((s, i) => (
                    <li key={i}>
                      <span className="course-sections__num">{i + 1}</span>
                      <span className="course-sections__title">
                        {s.title}
                        {s.label && <em className="course-sections__type">{s.label}</em>}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="course-sections__author">
                  <dt>Created and delivered by</dt>
                  <dd>
                    {detail.authorName}
                    <br />
                    <span>{detail.organisationName}</span>
                  </dd>
                </div>
              </div>
            )}
          </aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
