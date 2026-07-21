import Link from "next/link";
import Image from "next/image";
import AuthControls from "@/components/AuthControls";

/** The official BoostMySkills logo. */
function Brand() {
  return (
    <Link href="/" className="brand" aria-label="BoostMySkills home">
      <Image
        src="/brand/logo.png"
        alt="BoostMySkills"
        width={112}
        height={54}
        priority
        style={{ height: 54, width: "auto" }}
      />
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
        </nav>
        <div className="nav-right">
          <AuthControls />
        </div>
      </div>
    </header>
  );
}
