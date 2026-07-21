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
  // Handles any number of entries.
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

        <div className="course-detail__grid">
          <article className="course-detail__main">
            <p className="course-detail__eyebrow">{detail.organisationName}</p>
            <h1>{detail.title}</h1>
            <p className="course-detail__code">
              {detail.code} | {detail.projectName}
            </p>
            <div className="course-detail__cta">
              <EnrolButton credentialId={detail.id} />
            </div>

            {detail.bannerObjectKey && (
              // Served through the controlled /media route (published banners are public).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="course-detail__banner"
                src={`/media/${detail.bannerObjectKey}`}
                alt={`${detail.title} banner`}
              />
            )}

            {detail.shortDescription && (
              <p className="course-detail__lead">{detail.shortDescription}</p>
            )}

            {/* about_content is sanitised at write time; it may contain any number
                of <h2> blocks (Context and overview / Learning objectives / …). */}
            <div className="course-about" dangerouslySetInnerHTML={{ __html: about }} />
          </article>

          <aside className="course-detail__side">
            <div className="course-facts">
              <div className="course-fact">
                <dt>Course Number</dt>
                <dd>
                  {detail.code} | {detail.projectName}
                </dd>
              </div>
              <div className="course-fact">
                <dt>Format</dt>
                <dd>Self-paced &middot; fully online</dd>
              </div>
              <div className="course-fact">
                <dt>Created and delivered by</dt>
                <dd>
                  {detail.authorName}
                  <br />
                  <span>{detail.organisationName}</span>
                </dd>
              </div>
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
              </div>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
