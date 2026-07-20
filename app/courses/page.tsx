import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { listPublishedCredentials } from "@/lib/catalogue/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Micro-credentials" };

export default async function CoursesPage() {
  const credentials = await listPublishedCredentials();
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h1>Micro-credentials</h1>
        {credentials.length === 0 ? (
          <p style={{ color: "var(--bms-muted)" }}>No published micro-credentials yet.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              marginTop: 20,
            }}
          >
            {credentials.map((c) => (
              <Link
                key={c.id}
                href={`/courses/${c.slug}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <p style={{ fontSize: 12, color: "var(--bms-green)", fontWeight: 700 }}>
                  {c.code} · {c.organisationName}
                </p>
                <h3 style={{ margin: "6px 0" }}>{c.title}</h3>
                <p style={{ color: "var(--bms-muted)", fontSize: 14 }}>
                  {c.shortDescription ?? ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
