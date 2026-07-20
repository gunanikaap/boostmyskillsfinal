import SiteHeader from "@/components/SiteHeader";

export default function StaticPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 800 }}>
        <h1>{title}</h1>
        <div style={{ color: "var(--bms-ink)" }}>{children}</div>
      </main>
    </>
  );
}
