import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata = {
  title: "Become a leader in sustainability",
  description:
    "Free, fully funded micro-credentials and micro-programmes to future-proof your career in sustainability.",
};

function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Brand-coloured hero illustration (self-contained SVG, no external assets). */
function HeroArt() {
  return (
    <svg
      viewBox="0 0 460 380"
      width="100%"
      style={{ maxWidth: 460 }}
      role="img"
      aria-label="A learner earning a sustainability micro-credential"
    >
      <circle cx="240" cy="200" r="170" fill="var(--bms-green-soft)" />
      {/* browser / course window */}
      <rect x="70" y="90" width="300" height="200" rx="18" fill="#fff" stroke="#e5eae7" />
      <rect x="70" y="90" width="300" height="42" rx="18" fill="var(--bms-purple)" />
      <rect x="70" y="118" width="300" height="14" fill="var(--bms-purple)" />
      <circle cx="92" cy="111" r="5" fill="#fff" opacity="0.9" />
      <circle cx="110" cy="111" r="5" fill="#fff" opacity="0.7" />
      <circle cx="128" cy="111" r="5" fill="#fff" opacity="0.5" />
      <rect x="96" y="158" width="150" height="14" rx="7" fill="#e7ece9" />
      <rect x="96" y="186" width="210" height="10" rx="5" fill="#eef2f0" />
      <rect x="96" y="206" width="180" height="10" rx="5" fill="#eef2f0" />
      <rect x="96" y="238" width="120" height="30" rx="15" fill="var(--bms-green)" />
      {/* graduation cap */}
      <g transform="translate(300 60)">
        <path d="M0 26 45 6 90 26 45 46 0 26Z" fill="var(--bms-purple)" />
        <path d="M45 52c-18 0-30-7-30-14v-9l30 13 30-13v9c0 7-12 14-30 14Z" fill="#7a49c2" />
        <rect x="86" y="26" width="4" height="26" rx="2" fill="var(--bms-purple)" />
        <circle cx="88" cy="56" r="6" fill="var(--bms-green)" />
      </g>
      {/* growth / leaf motif */}
      <g transform="translate(330 250)">
        <path d="M0 60c0-30 22-52 52-52-2 30-24 52-52 52Z" fill="var(--bms-green)" />
        <path d="M6 60c0-22 16-40 40-42-10 24-24 40-40 42Z" fill="var(--bms-green-bright)" />
        <rect x="24" y="58" width="4" height="34" rx="2" fill="var(--bms-green-dark)" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* ---- Hero ---- */}
        <section className="container hero">
          <div>
            <p className="eyebrow">FREE fully funded courses</p>
            <h1>Become a leader in sustainability</h1>
            <p className="lead">
              Accelerate and future-proof your career in sustainability — or gain the skills to
              advance your organisation&rsquo;s sustainability initiatives — through verifiable
              micro-credentials and micro-programmes.
            </p>
            <div className="hero__cta">
              <Link href="/programs" className="btn btn-lg">
                Explore micro-programmes <ArrowRight />
              </Link>
              <Link href="/courses" className="btn btn-outline btn-lg">
                Explore micro-credentials <ArrowRight />
              </Link>
            </div>
            <p className="partners">
              Aligned with the UN Sustainable Development Goals and delivered with pan-European and
              international university partners.
            </p>
          </div>
          <div className="hero__art">
            <HeroArt />
          </div>
        </section>

        {/* ---- Choose your option ---- */}
        <section className="section section--soft">
          <div className="container">
            <h2>Choose your option</h2>
            <p className="sub">Two ways to learn and earn verifiable, shareable credentials.</p>
            <div className="grid-2">
              <div className="card option-card">
                <span className="pill-num" aria-hidden="true">
                  ◇
                </span>
                <h3>Micro-programmes</h3>
                <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                  Structured learning paths that bundle several micro-credentials into a programme,
                  with aggregate progress and a programme completion.
                </p>
                <Link href="/programs" className="btn" style={{ alignSelf: "flex-start" }}>
                  Browse micro-programmes <ArrowRight />
                </Link>
              </div>
              <div className="card option-card">
                <span className="pill-num" aria-hidden="true">
                  ○
                </span>
                <h3>Micro-credentials</h3>
                <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                  Focused courses with readings, videos and assessments. Pass to earn a verifiable
                  certificate you can share and verify publicly.
                </p>
                <Link href="/courses" className="btn" style={{ alignSelf: "flex-start" }}>
                  Browse micro-credentials <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---- How to get started ---- */}
        <section className="section">
          <div className="container">
            <h2>How to get started?</h2>
            <p className="sub">Three steps from sign-up to a verifiable credential.</p>
            <div className="grid-3">
              <div className="card">
                <span className="pill-num">1</span>
                <h3 style={{ margin: "12px 0 6px" }}>Register for free</h3>
                <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                  Create your free account to enrol in micro-credentials and micro-programmes.
                </p>
              </div>
              <div className="card">
                <span className="pill-num">2</span>
                <h3 style={{ margin: "12px 0 6px" }}>Learn &amp; complete</h3>
                <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                  Work through readings, videos and knowledge checks at your own pace; your progress
                  is tracked at every level.
                </p>
              </div>
              <div className="card">
                <span className="pill-num">3</span>
                <h3 style={{ margin: "12px 0 6px" }}>Earn your credential</h3>
                <p style={{ color: "var(--bms-muted)", margin: 0 }}>
                  Pass the assessment to earn a certificate with a public verification link.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 28 }}>
              <Link href="/sign-up" className="btn btn-lg">
                Register for free <ArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
