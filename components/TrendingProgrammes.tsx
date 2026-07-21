import Link from "next/link";
import Image from "next/image";
import { listPublishedProgrammes, type CatalogueProgramme } from "@/lib/catalogue/queries";

const ART = [
  "/brand/programs/mp1.jpg",
  "/brand/programs/mp2.jpg",
  "/brand/programs/mp3.jpg",
  "/brand/programs/mp4.jpg",
  "/brand/programs/mp5.jpg",
  "/brand/programs/mp6.jpg",
];

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

interface Card {
  key: string;
  href: string;
  img: string;
  org: string;
  title: string;
  cta: string;
}

/**
 * "Our Trending Micro-programmes" — a horizontal carousel of the catalogue's
 * published programmes, styled to match boostmyskills.eu. Each card uses the
 * programme's banner when present, otherwise a themed sustainability illustration.
 * If the catalogue is empty (or unreachable) it degrades to a few browse tiles so
 * the section still renders.
 */
export default async function TrendingProgrammes() {
  let programmes: CatalogueProgramme[] = [];
  try {
    programmes = (await listPublishedProgrammes()).slice(0, 8);
  } catch {
    programmes = [];
  }

  // Browse tiles shown only when the catalogue has no published programmes yet.
  const BROWSE: { title: string; theme: string }[] = [
    { title: "Sustainable cities & clean energy", theme: "Explore the catalogue" },
    { title: "Low-carbon industry & emissions", theme: "Explore the catalogue" },
    { title: "Circular & green economy", theme: "Explore the catalogue" },
  ];

  const cards: Card[] =
    programmes.length > 0
      ? programmes.map((p, i) => ({
          key: p.id,
          href: `/programs/${p.slug}`,
          img: p.bannerObjectKey ? `/media/${p.bannerObjectKey}` : ART[i % ART.length]!,
          org: p.organisationName,
          title: p.title,
          cta: "View programme",
        }))
      : BROWSE.map((b, i) => ({
          key: `browse-${i}`,
          href: "/programs",
          img: ART[i % ART.length]!,
          org: b.theme,
          title: b.title,
          cta: "Browse micro-programmes",
        }));

  return (
    <section className="container trending">
      <div className="trending__head">
        <div>
          <p className="eyebrow">Discover</p>
          <h2>Our Trending Micro-programmes</h2>
        </div>
        <Link href="/programs" className="btn btn-outline">
          View all <Arrow />
        </Link>
      </div>
      <div className="carousel">
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="pcard">
            <div className="pcard__art">
              <Image
                src={c.img}
                alt=""
                fill
                sizes="360px"
                style={{ objectFit: "cover" }}
                unoptimized={c.img.startsWith("/media/")}
              />
            </div>
            <div className="pcard__body">
              <p className="pcard__org">{c.org}</p>
              <h3 className="pcard__title">{c.title}</h3>
              <span className="pcard__cta">
                {c.cta} <Arrow />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
