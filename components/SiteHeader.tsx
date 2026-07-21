import Link from "next/link";
import AuthControls from "@/components/AuthControls";

/** The BoostMySkills wordmark, styled to echo the boostmyskills.eu logo. */
function Brand() {
  return (
    <Link href="/" className="brand" aria-label="BoostMySkills home">
      <span className="brand__boost">boost</span>
      <span className="brand__my">my</span>
      <span className="brand__skills">skills</span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Brand />
        <nav className="nav-links" aria-label="Primary">
          <details className="dropdown">
            <summary>
              Catalogue
              <svg
                className="chev"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                style={{ transition: "transform 0.15s ease" }}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="dropdown__menu">
              <Link href="/programs">Micro-programmes</Link>
              <Link href="/courses">Micro-credentials</Link>
            </div>
          </details>
          <Link href="/about" style={{ padding: "8px 12px", color: "var(--bms-ink)" }}>
            About
          </Link>
        </nav>
        <div className="nav-right">
          <AuthControls />
        </div>
      </div>
    </header>
  );
}
