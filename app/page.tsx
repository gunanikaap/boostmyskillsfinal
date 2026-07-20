import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 48 }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ color: "var(--bms-green)", fontWeight: 700, letterSpacing: 1 }}>
          BOOSTMYSKILLS
        </p>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>
          Micro-credentials for sustainability skills
        </h1>
        <p style={{ color: "var(--bms-muted)", maxWidth: 640 }}>
          Learn, complete assessments, and earn verifiable micro-credentials and micro-programmes.
        </p>
      </header>
      <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="btn" href="/courses">
          Browse micro-credentials
        </Link>
        <Link className="btn" href="/programs">
          Browse micro-programmes
        </Link>
      </nav>
    </main>
  );
}
