import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getPublishedProgrammeBySlug } from "@/lib/programmes/queries";
import { RegisterButton } from "./RegisterButton";
import { enforceMaintenanceForPage } from "@/lib/settings/maintenanceGate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await getPublishedProgrammeBySlug(slug);
  if (!detail) return { title: "Not found" };
  return { title: detail.title, description: detail.shortDescription ?? undefined };
}

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await enforceMaintenanceForPage();
  const { slug } = await params;
  const detail = await getPublishedProgrammeBySlug(slug);
  if (!detail) notFound();

  const about = (detail.aboutContent as { html?: string } | null)?.html ?? "";
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <p style={{ fontSize: 13, color: "var(--bms-green)", fontWeight: 700 }}>
          {detail.organisationName}
        </p>
        <h1 style={{ marginTop: 4 }}>{detail.title}</h1>
        {detail.bannerObjectKey && (
          // Served through the controlled /media route (published programme banners are public).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/media/${detail.bannerObjectKey}`}
            alt={`${detail.title} banner`}
            style={{
              width: "100%",
              maxWidth: 720,
              aspectRatio: "16 / 9",
              objectFit: "cover",
              borderRadius: 12,
              margin: "12px 0",
            }}
          />
        )}
        <div
          className="card"
          style={{ marginTop: 16 }}
          dangerouslySetInnerHTML={{ __html: about }}
        />
        <h2 style={{ marginTop: 24 }}>Included micro-credentials</h2>
        <ol>
          {detail.credentials.map((c) => (
            <li key={c.id}>
              <Link href={`/courses/${c.slug}`}>
                {c.code} — {c.title}
              </Link>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 24 }}>
          <RegisterButton programmeId={detail.id} />
        </div>
      </main>
    </>
  );
}
