import Link from "next/link";
import Image from "next/image";
import type { ComponentType } from "react";
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

// --- Icons -------------------------------------------------------------------
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
function Shield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V5l8-3z" />
    </svg>
  );
}
function Heart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21S3 15 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5C21 15 12 21 12 21z" />
    </svg>
  );
}
function Bolt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function Star() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
    </svg>
  );
}
function Person() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8c0-3.9 3.1-6 7-6s7 2.1 7 6H5z" />
    </svg>
  );
}

// --- Content -----------------------------------------------------------------
const BENEFITS: { Icon: ComponentType; lead: string; body: string }[] = [
  {
    Icon: Star,
    lead: "Upskill for a greener future.",
    body: "Build in-demand sustainability expertise and grow into a leader in the green economy.",
  },
  {
    Icon: Shield,
    lead: "Flexible learning.",
    body: "Study at your own pace, anytime and anywhere, with fully online courses and resources.",
  },
  {
    Icon: Bolt,
    lead: "Practical skills.",
    body: "Apply what you learn through real-world projects, case studies and assessments.",
  },
  {
    Icon: Heart,
    lead: "Positive impact.",
    body: "Help build a sustainable future by developing solutions to real environmental challenges.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "The range of renewable-energy courses is genuinely impressive — I'd recommend BoostMySkills to anyone serious about a sustainable future.",
    name: "Anya Petrova",
    role: "Sustainability Consultant",
  },
  {
    quote: "The practical skills I picked up went straight into my day-to-day work.",
    name: "Maria Gonzalez",
    role: "Renewable Energy Engineer",
  },
  {
    quote:
      "BoostMySkills helped me find a clear direction in sustainability and see real career paths.",
    name: "David Kim",
    role: "Student",
  },
];

const PROJECTS = [
  { src: "/brand/funding-res4city.png", alt: "RES4CITY — funded by the European Union" },
  { src: "/brand/funding-sherlock.png", alt: "SHERLOCK — funded by the European Union" },
  { src: "/brand/funding-resskill.png", alt: "RESSKILL — co-funded by the European Union" },
  { src: "/brand/funding-streacs.png", alt: "STREACS — funded by the European Union" },
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

        {/* ---- Certificates ---- */}
        <section className="section section--soft">
          <div className="container feature">
            <div>
              <p className="eyebrow">Earn BoostMySkills</p>
              <h2>Micro-credential and Micro-programme Certificates</h2>
              <p style={{ color: "var(--bms-muted)", fontSize: 18, margin: "0 0 8px" }}>
                Develop and advance your expertise with our comprehensive micro-credential and
                micro-programme courses. Gain practical knowledge and skills to drive energy
                innovation and decarbonisation strategies.
              </p>
              <ul className="ticks">
                <li>
                  <span className="tick-plain" aria-hidden="true">
                    <Shield />
                  </span>{" "}
                  <span style={{ fontWeight: 600 }}>
                    Developed by pan-European and international universities, co-funded by the EU,
                    Swiss Confederation and a consortium of South Korean universities (COSS) — and
                    supported by the United Nations Institute for Training &amp; Research (UNITAR).
                  </span>
                </li>
              </ul>
            </div>
            <div className="feature__art">
              <Image
                src="/brand/certificate.png"
                alt="A verifiable BoostMySkills certificate of completion"
                width={460}
                height={460}
                style={{ width: "100%", height: "auto", maxWidth: 460 }}
              />
            </div>
          </div>
        </section>

        {/* ---- Choose your option ---- */}
        <section className="section section--soft section--center">
          <div className="container">
            <p className="eyebrow">Expand your Knowledge with Specialised Learning Paths</p>
            <h2>Choose your option</h2>
            <p className="sub">
              Choose a micro-programme — a curated set of micro-credentials — or pick one or more
              individual micro-credentials that match your goals.
            </p>
            <div className="grid-2">
              <div className="card option-card option-card--primary">
                <span className="option-card__icon" aria-hidden="true">
                  <Heart />
                </span>
                <h3>Micro-programmes</h3>
                <p>
                  Deepen your expertise with comprehensive micro-programmes that bundle several
                  micro-credentials into one guided learning path.
                </p>
                <Link href="/programs" className="btn">
                  View all
                </Link>
              </div>
              <div className="card option-card">
                <span className="option-card__icon" aria-hidden="true">
                  <Bolt />
                </span>
                <h3>Micro-credentials</h3>
                <p>
                  Boost your skill set with targeted micro-credentials — concise courses ideal for
                  building a specific competency.
                </p>
                <Link href="/courses" className="btn">
                  View all
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Get started in 3 simple steps ---- */}
        <section className="section">
          <div className="container steps">
            <div className="steps__title">
              <p className="eyebrow">How to get started?</p>
              <h2>Get started in 3 simple steps</h2>
              <p className="sub" style={{ margin: 0 }}>
                Achieve your learning goals quickly by following these straightforward steps.
              </p>
            </div>
            <div className="steps__list">
              <div className="step">
                <span className="step__num">1</span>
                <div>
                  <h3>First Step</h3>
                  <p>
                    Create your free account and explore our diverse range of micro-programmes and
                    micro-credentials.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">2</span>
                <div>
                  <h3>Second Step</h3>
                  <p>
                    Choose the micro-programmes and/or micro-credentials that align with your goals
                    and interests.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">3</span>
                <div>
                  <h3>Third Step</h3>
                  <p>
                    Start learning at your own pace and earn your certifications to boost your
                    skills and career prospects.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Benefits ---- */}
        <section className="section section--soft">
          <div className="container benefits-layout">
            <div className="benefits-media">
              <Image
                src="/brand/benefits.png"
                alt="A BoostMySkills micro-credential course page shown on a tablet"
                width={866}
                height={1281}
                style={{ width: "100%", height: "auto", maxWidth: 460 }}
              />
            </div>
            <div>
              <p className="eyebrow">Certifications to boost your skills and career prospects</p>
              <h2>Benefits of BoostMySkills</h2>
              <div className="benefits-grid">
                {BENEFITS.map((b) => (
                  <div key={b.lead} className="benefit">
                    <span className="benefit__icon" aria-hidden="true">
                      <b.Icon />
                    </span>
                    <p>
                      <strong>{b.lead}</strong> {b.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- Testimonials ---- */}
        <section className="section">
          <div className="container">
            <h2>What People Are Saying</h2>
            <div className="grid-3" style={{ marginTop: 24 }}>
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="card tcard">
                  <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                  <div className="tcard__who">
                    <span className="tcard__avatar" aria-hidden="true">
                      <Person />
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
            <h2>Our Partners</h2>
            <Image
              src="/brand/partners.jpg"
              alt="BoostMySkills partner universities and organisations"
              width={1000}
              height={620}
              style={{ width: "100%", height: "auto", maxWidth: 1000 }}
            />
            <div className="projects-box">
              {PROJECTS.map((p) => (
                <Image
                  key={p.src}
                  src={p.src}
                  alt={p.alt}
                  width={260}
                  height={52}
                  style={{ height: 52, width: "auto" }}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
