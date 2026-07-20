import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
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
  const sectionCount = detail.content.sections.length;
  const unitCount = detail.content.sections
    .flatMap((s) => s.subsections)
    .flatMap((ss) => ss.units).length;

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <p style={{ fontSize: 13, color: "var(--bms-green)", fontWeight: 700 }}>
          {detail.code} · {detail.organisationName}
        </p>
        <h1 style={{ marginTop: 4 }}>{detail.title}</h1>
        <p style={{ color: "var(--bms-muted)" }}>By {detail.authorName}</p>
        <p style={{ color: "var(--bms-muted)" }}>
          {sectionCount} sections · {unitCount} units
        </p>
        {/* about content is sanitised at write time */}
        <div
          className="card"
          style={{ marginTop: 20 }}
          dangerouslySetInnerHTML={{ __html: about }}
        />
        <div style={{ marginTop: 24 }}>
          <EnrolButton credentialId={detail.id} />
        </div>
      </main>
    </>
  );
}
