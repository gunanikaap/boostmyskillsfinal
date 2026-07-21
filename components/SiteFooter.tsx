import Link from "next/link";
import Image from "next/image";

// The official channel; swap in the exact company slug if it ever changes.
const LINKEDIN_URL = "https://www.linkedin.com/company/boostmyskills";

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5A2.5 2.5 0 002.5 6a2.5 2.5 0 002.48 2.5A2.5 2.5 0 007.5 6a2.5 2.5 0 00-2.52-2.5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95C20.2 8.75 21 11 21 14.1V21h-4v-6.1c0-1.46-.03-3.33-2.03-3.33-2.03 0-2.34 1.58-2.34 3.22V21H9z" />
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div
        className="container"
        style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-between" }}
      >
        <div style={{ maxWidth: 320 }}>
          <Link href="/" aria-label="BoostMySkills" style={{ display: "inline-block" }}>
            <Image
              src="/brand/logo.png"
              alt="BoostMySkills"
              width={200}
              height={102}
              style={{ width: 168, height: "auto", marginBottom: 12 }}
            />
          </Link>
          <p style={{ margin: 0, fontSize: 14 }}>
            Free, fully funded micro-credentials and micro-programmes for sustainability skills.
          </p>
        </div>
        <nav style={{ display: "grid", gap: 8, fontSize: 14 }} aria-label="Company">
          <Link href="/courses">Self-Assessment</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/cookie-policy">Cookie Policy</Link>
          <Link href="/terms">Terms and Conditions</Link>
        </nav>
        <nav style={{ display: "grid", gap: 8, fontSize: 14 }} aria-label="Our projects">
          <strong style={{ color: "#fff" }}>Our projects</strong>
          <span>RES4CITY</span>
          <span>SHERLOCK</span>
          <span>COSS</span>
          <span>RESSKILL</span>
          <span>STREACS</span>
        </nav>
        <nav style={{ display: "grid", gap: 8, fontSize: 14 }} aria-label="Get in touch">
          <strong style={{ color: "#fff" }}>Get in touch</strong>
          <Link href="/contact">Contact Us</Link>
          <Link href="/about">About us</Link>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BoostMySkills on LinkedIn"
            style={{ display: "inline-flex", marginTop: 2 }}
          >
            <LinkedInIcon />
          </a>
        </nav>
      </div>
      <div className="container" style={{ marginTop: 28, fontSize: 12, color: "#8ea197" }}>
        © {"BoostMySkills"} · Building sustainability skills across Europe.
      </div>
    </footer>
  );
}
