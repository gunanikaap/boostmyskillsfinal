import Link from "next/link";
import Image from "next/image";
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

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* ---- Hero ---- */}
        <section className="container hero">
          <div className="hero__text">
            <p className="eyebrow">FREE fully funded courses</p>
            <h1>Become a leader in sustainability</h1>
            <p className="lead">
              Accelerate and future-proof your career in sustainability, or gain the skills to
              advance your organisation&rsquo;s sustainability initiatives, through courses
              developed with pan-European and international university partners — co-funded by the
              EU and supported by the United Nations Institute for Training &amp; Research (UNITAR).
            </p>
            <div className="hero__cta">
              <Link href="/programs" className="btn btn-lg">
                Explore Micro-programmes <ArrowRight />
              </Link>
              <Link href="/courses" className="btn btn-outline btn-lg">
                Explore Micro-credentials <ArrowRight />
              </Link>
            </div>
          </div>
          <div className="hero__art">
            <Image
              src="/brand/landing_img.png"
              alt="Learn sustainability online — aligned with the UN SDGs and UNITAR, with partner universities"
              width={520}
              height={641}
              priority
              style={{ width: "100%", height: "auto", maxWidth: 520 }}
            />
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
