import Link from "next/link";
import {
  listPublishedProgrammesWithMembers,
  type CatalogueProgrammeWithMembers,
} from "@/lib/catalogue/queries";
import { ProgrammeCard } from "@/components/CatalogueCards";

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

/**
 * "Our Trending Micro-programmes" — a horizontal carousel of the catalogue's
 * published programmes, styled to match boostmyskills.eu (banner, title,
 * code | project, included micro-credentials list, Enrol). Empty catalogue → the
 * section is hidden.
 */
export default async function TrendingProgrammes() {
  let programmes: CatalogueProgrammeWithMembers[] = [];
  try {
    programmes = (await listPublishedProgrammesWithMembers()).slice(0, 8);
  } catch {
    programmes = [];
  }
  if (programmes.length === 0) return null;

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
        {programmes.map((p, i) => (
          <ProgrammeCard key={p.id} p={p} i={i} />
        ))}
      </div>
    </section>
  );
}
