import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import TrendingProgrammes from "@/components/TrendingProgrammes";

// Pulls published programmes for the trending carousel — render per request.
export const dynamic = "force-dynamic";

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

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const BENEFITS = [
  {
    title: "Free & fully funded",
    body: "All micro-credentials and micro-programmes are free to enrol and complete.",
    icon: "M12 2v20M2 12h20",
  },
  {
    title: "Learn at your own pace",
    body: "Readings, videos and knowledge checks you can complete anytime, anywhere.",
    icon: "M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z",
  },
  {
    title: "Verifiable credentials",
    body: "Earn certificates that anyone can verify online through a public link.",
    icon: "M9 12l2 2 4-4M12 22a10 10 0 100-20 10 10 0 000 20z",
  },
  {
    title: "Built with universities",
    body: "Content developed with pan-European and international university partners.",
    icon: "M12 3L2 9l10 6 10-6-10-6zM6 12v5l6 3 6-3v-5",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "The micro-programmes gave me practical, up-to-date sustainability skills I could apply at work straight away.",
    name: "Learner",
    role: "Sustainability micro-programme",
  },
  {
    quote:
      "Clear, focused courses and a certificate I can actually share. Exactly what I needed to upskill for the green transition.",
    name: "Learner",
    role: "Renewable energy micro-credential",
  },
  {
    quote:
      "Being able to learn at my own pace and earn a verifiable credential made all the difference for my career.",
    name: "Learner",
    role: "City decarbonisation micro-programme",
  },
];

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

        {/* ---- Our Trending Micro-programmes ---- */}
        <TrendingProgrammes />

        {/* ---- Earn a verifiable certificate ---- */}
        <section className="section section--soft">
          <div className="container feature">
            <div className="feature__art">
              <Image
                src="/brand/certificate.png"
                alt="A verifiable BoostMySkills micro-credential certificate"
                width={420}
                height={420}
                style={{ width: "100%", height: "auto", maxWidth: 420 }}
              />
            </div>
            <div>
              <p className="eyebrow">Recognised & verifiable</p>
              <h2>Earn a BoostMySkills certificate</h2>
              <p style={{ color: "var(--bms-muted)", fontSize: 18, margin: 0 }}>
                Complete a micro-credential to earn a certificate you can share and that anyone can
                verify online — backed by a public verification link.
              </p>
              <ul className="ticks">
                <li>
                  <span className="tick" aria-hidden="true">
                    <Check />
                  </span>{" "}
                  Assessed, evidence-based and issued automatically on completion.
                </li>
                <li>
                  <span className="tick" aria-hidden="true">
                    <Check />
                  </span>{" "}
                  Publicly verifiable — no login needed to confirm a certificate.
                </li>
                <li>
                  <span className="tick" aria-hidden="true">
                    <Check />
                  </span>{" "}
                  Bundle credentials into a micro-programme for a full learning path.
                </li>
              </ul>
              <div style={{ marginTop: 24 }}>
                <Link href="/courses" className="btn btn-lg">
                  Start a micro-credential <ArrowRight />
                </Link>
              </div>
            </div>
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

        {/* ---- Benefits ---- */}
        <section className="section section--soft">
          <div className="container">
            <h2>Benefits of BoostMySkills</h2>
            <p className="sub">Why learners across Europe choose BoostMySkills.</p>
            <div
              className="grid-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
            >
              {BENEFITS.map((b) => (
                <div key={b.title} className="card benefit">
                  <span className="benefit__icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d={b.icon}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h3>{b.title}</h3>
                  <p>{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Testimonials ---- */}
        <section className="section">
          <div className="container">
            <h2>What people are saying</h2>
            <p className="sub">Learners on the BoostMySkills catalogue.</p>
            <div className="grid-3">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="card tcard">
                  <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                  <div className="tcard__who">
                    <span className="tcard__avatar" aria-hidden="true">
                      {t.name.charAt(0)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div style={{ color: "var(--bms-muted)", fontSize: 13 }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Partners ---- */}
        <section className="section section--soft">
          <div className="container partners-strip">
            <h2>Our partners</h2>
            <p className="sub" style={{ marginBottom: 0 }}>
              Co-funded by the EU and delivered with our project and university partners.
            </p>
            <Image
              src="/brand/partners.jpg"
              alt="BoostMySkills partners and funders"
              width={900}
              height={220}
              style={{ width: "100%", height: "auto", maxWidth: 900 }}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
