import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

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
      <main className="container" style={{ paddingTop: 40, paddingBottom: 56, maxWidth: 800 }}>
        <h1 style={{ letterSpacing: "-0.5px" }}>{title}</h1>
        <div style={{ color: "var(--bms-ink)" }}>{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
