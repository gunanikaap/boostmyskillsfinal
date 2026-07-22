import Link from "next/link";
import Image from "next/image";

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

const FALLBACK = ["/brand/programs/mp1.jpg", "/brand/programs/mp2.jpg", "/brand/programs/mp3.jpg"];
function artFor(bannerObjectKey: string | null, i: number): string {
  return bannerObjectKey ? `/media/${bannerObjectKey}` : FALLBACK[i % FALLBACK.length]!;
}

/** Anonymous visitors are sent to sign in (and returned to the detail page). */
function enrolHref(detailHref: string, signedIn: boolean): string {
  return signedIn ? detailHref : `/sign-in?redirect_url=${encodeURIComponent(detailHref)}`;
}

export interface CredentialCardData {
  slug: string;
  code: string;
  title: string;
  shortDescription: string | null;
  organisationName: string;
  projectName: string;
  bannerObjectKey: string | null;
}

export function CredentialCard({
  c,
  i = 0,
  signedIn = false,
}: {
  c: CredentialCardData;
  i?: number;
  signedIn?: boolean;
}) {
  const img = artFor(c.bannerObjectKey, i);
  const href = `/courses/${c.slug}`;
  return (
    <article className="pcard">
      <div className="pcard__art">
        <Image
          src={img}
          alt=""
          fill
          sizes="360px"
          style={{ objectFit: "cover" }}
          unoptimized={img.startsWith("/media/")}
        />
      </div>
      <div className="pcard__body">
        <p className="pcard__org">{c.organisationName}</p>
        <p className="pcard__code">
          {c.code} | {c.projectName}
        </p>
        <h3 className="pcard__title">
          <Link href={href}>{c.title}</Link>
        </h3>
        <div className="pcard__footer">
          <Link href={enrolHref(href, signedIn)} className="btn pcard__enrol">
            Enrol <Arrow />
          </Link>
          <Link href={href} className="pcard__more">
            More info <Arrow />
          </Link>
        </div>
      </div>
    </article>
  );
}

export interface ProgrammeCardData {
  slug: string;
  title: string;
  shortDescription: string | null;
  organisationName: string;
  bannerObjectKey: string | null;
  memberTitles: string[];
}

export function ProgrammeCard({
  p,
  i = 0,
  signedIn = false,
}: {
  p: ProgrammeCardData;
  i?: number;
  signedIn?: boolean;
}) {
  const img = artFor(p.bannerObjectKey, i);
  const href = `/programs/${p.slug}`;
  const code = `MP${i + 1}`;
  return (
    <article className="pcard">
      <div className="pcard__art">
        <Image
          src={img}
          alt=""
          fill
          sizes="380px"
          style={{ objectFit: "cover" }}
          unoptimized={img.startsWith("/media/")}
        />
      </div>
      <div className="pcard__body">
        <h3 className="pcard__title">
          <Link href={href}>{p.title}</Link>
        </h3>
        <p className="pcard__code">
          {code} | {p.organisationName}
        </p>
        {p.memberTitles.length > 0 && (
          <>
            <p className="members-label">Includes the following micro-credentials:</p>
            <ul className="pcard__members">
              {p.memberTitles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <div className="pcard__footer">
          <Link href={enrolHref(href, signedIn)} className="btn pcard__enrol">
            Enrol <Arrow />
          </Link>
          <Link href={href} className="pcard__more">
            More info <Arrow />
          </Link>
        </div>
      </div>
    </article>
  );
}
