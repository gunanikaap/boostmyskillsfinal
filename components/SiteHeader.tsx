import Link from "next/link";
import AuthControls from "@/components/AuthControls";

export default function SiteHeader() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--bms-border)",
        background: "var(--bms-card)",
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 20px" }}
      >
        <Link
          href="/"
          style={{ fontWeight: 800, color: "var(--bms-green)", textDecoration: "none" }}
        >
          BoostMySkills
        </Link>
        <nav style={{ display: "flex", gap: 16, marginLeft: "auto" }}>
          <Link href="/courses">Micro-credentials</Link>
          <Link href="/programs">Micro-programmes</Link>
          <Link href="/about">About</Link>
          <Link href="/dashboard">Dashboard</Link>
          <AuthControls />
        </nav>
      </div>
    </header>
  );
}
