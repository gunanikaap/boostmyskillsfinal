import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div
        className="container"
        style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-between" }}
      >
        <div style={{ maxWidth: 320 }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
            <span style={{ color: "#fff" }}>boost</span>
            <span style={{ color: "#b79be6" }}>my</span>
            <span style={{ color: "var(--bms-green-bright)" }}>skills</span>
          </div>
          <p style={{ margin: 0, fontSize: 14 }}>
            Free, fully funded micro-credentials and micro-programmes for sustainability skills.
          </p>
        </div>
        <nav style={{ display: "grid", gap: 8, fontSize: 14 }} aria-label="Footer">
          <strong style={{ color: "#fff" }}>Catalogue</strong>
          <Link href="/programs">Micro-programmes</Link>
          <Link href="/courses">Micro-credentials</Link>
          <Link href="/about">About</Link>
        </nav>
        <nav style={{ display: "grid", gap: 8, fontSize: 14 }} aria-label="Account">
          <strong style={{ color: "#fff" }}>Account</strong>
          <Link href="/sign-up">Register for free</Link>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/dashboard">Your learning</Link>
        </nav>
      </div>
      <div className="container" style={{ marginTop: 28, fontSize: 12, color: "#8ea197" }}>
        © {"BoostMySkills"} · Building sustainability skills across Europe.
      </div>
    </footer>
  );
}
