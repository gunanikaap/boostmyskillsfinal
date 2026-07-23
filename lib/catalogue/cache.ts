import { unstable_cache } from "next/cache";
import {
  listPublishedCredentials,
  getPublishedCredentialBySlug,
  listPublishedProgrammesWithMembers,
} from "@/lib/catalogue/queries";
import { getPublishedProgrammeBySlug } from "@/lib/programmes/queries";

/**
 * Cached reads for the PUBLIC catalogue.
 *
 * The public pages stay dynamically rendered because they also show per-user
 * state (signed-in, enrolled, completed) — caching a whole page would serve one
 * visitor's state to everyone. What we cache instead is the expensive, purely
 * content-derived part: the catalogue queries. Those results are identical for
 * every visitor, so a read-heavy catalogue no longer costs one round trip to
 * PostgreSQL per request.
 *
 * Correctness is preserved by INVALIDATION, not by short expiry: every admin
 * action that changes published catalogue content calls
 * `revalidateTag(CATALOGUE_TAG)` (see app/admin/actions.ts), so publish / hide /
 * unhide are reflected immediately, exactly as before. The `revalidate` window
 * below is only a self-healing backstop in case an invalidation path is ever
 * missed.
 *
 * NEVER cache per-user data here (enrolment state, dashboards, progress) — only
 * content that is the same for every anonymous and signed-in visitor.
 */

/** Coarse tag covering every public catalogue read. Catalogue writes are rare
 *  (admin-only), so one tag is simpler and safer than per-slug invalidation. */
export const CATALOGUE_TAG = "catalogue";

/** Backstop expiry (seconds) if a tag invalidation is ever missed. */
const CATALOGUE_REVALIDATE_SECONDS = 300;

const cacheOptions = {
  tags: [CATALOGUE_TAG],
  revalidate: CATALOGUE_REVALIDATE_SECONDS,
};

/** Published credential catalogue (course listing). */
export const getCachedPublishedCredentials = unstable_cache(
  async () => listPublishedCredentials(),
  ["catalogue", "credentials"],
  cacheOptions,
);

/** Public credential detail by slug. Null for draft/hidden/missing. */
export const getCachedPublishedCredentialBySlug = unstable_cache(
  async (slug: string) => getPublishedCredentialBySlug(slug),
  ["catalogue", "credential-by-slug"],
  cacheOptions,
);

/** Published programmes with their ordered member-credential titles. */
export const getCachedPublishedProgrammesWithMembers = unstable_cache(
  async () => listPublishedProgrammesWithMembers(),
  ["catalogue", "programmes"],
  cacheOptions,
);

/** Public programme detail by slug. Null for draft/hidden/missing. */
export const getCachedPublishedProgrammeBySlug = unstable_cache(
  async (slug: string) => getPublishedProgrammeBySlug(slug),
  ["catalogue", "programme-by-slug"],
  cacheOptions,
);
