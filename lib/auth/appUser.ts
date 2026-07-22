import { db, type Queryable } from "@/lib/db/pool";
import { resolveExternalIdentity, type ExternalIdentity } from "@/lib/auth/identity";
import { normalizeEmail, normalizeUsername, SyncError } from "@/lib/auth/normalize";

export type AppRole = "learner" | "admin";

export interface AppUser {
  id: string;
  clerkUserId: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: AppRole;
  country: string | null;
  gender: string | null;
  /** True once an admin has approved this account's deletion request. */
  deactivated: boolean;
}

function mapRow(r: {
  id: string;
  clerk_user_id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  country: string | null;
  gender: string | null;
  deactivated_at: string | null;
}): AppUser {
  return {
    id: r.id,
    clerkUserId: r.clerk_user_id,
    email: r.email,
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    country: r.country,
    gender: r.gender,
    deactivated: r.deactivated_at != null,
  };
}

export interface SyncOptions {
  /**
   * Whether the identity provider is authoritative for the self-editable profile
   * fields (name / country / gender).
   *
   * - true (default) — an explicit profile event (the Clerk user.updated webhook,
   *   or a direct sync): the provider's values win, so real profile changes
   *   propagate into app_users.
   * - false — the per-request session sync (getCurrentAppUser): the provider only
   *   fills a field that is still empty, so a routine page load never clobbers an
   *   edit the learner made on the /account page.
   *
   * Either way, email/username stay provider-owned and role is never touched here.
   */
  authoritative?: boolean;
}

/**
 * Upsert the application user for an external identity.
 *
 * SECURITY: role is NEVER taken from the caller/browser. New users always
 * default to 'learner'. An existing user's role is preserved on sync — role
 * changes happen only through a controlled server-side promotion (promoteToAdmin)
 * or a migration. Clerk handles authentication; this table is authorization.
 */
export async function syncAppUser(
  identity: ExternalIdentity,
  conn: Queryable = db,
  opts: SyncOptions = {},
): Promise<AppUser> {
  const email = normalizeEmail(identity.email);
  // A missing primary email is a typed, safe failure — never write an empty
  // string or an otherwise unusable app_users row.
  if (email === "") {
    throw new SyncError("missing_email", "Cannot synchronize a user without a primary email");
  }
  const username = normalizeUsername(identity.username);
  const authoritative = opts.authoritative ?? true;

  // Profile fields: the provider wins on an authoritative sync (propagate real
  // changes); on a routine session sync it only fills an empty field so it can't
  // overwrite an /account-page edit.
  const profileSet = authoritative
    ? `first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       country = COALESCE(EXCLUDED.country, app_users.country),
       gender = COALESCE(EXCLUDED.gender, app_users.gender)`
    : `first_name = COALESCE(app_users.first_name, EXCLUDED.first_name),
       last_name = COALESCE(app_users.last_name, EXCLUDED.last_name),
       country = COALESCE(app_users.country, EXCLUDED.country),
       gender = COALESCE(app_users.gender, EXCLUDED.gender)`;

  try {
    const { rows } = await conn.query(
      `INSERT INTO app_users (clerk_user_id, email, username, first_name, last_name, role, country, gender)
       VALUES ($1, $2, $3, $4, $5, 'learner', $6, $7)
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET email = EXCLUDED.email,
             username = EXCLUDED.username,
             ${profileSet}
       RETURNING id, clerk_user_id, email, username, first_name, last_name, role, country, gender, deactivated_at`,
      [
        identity.clerkUserId,
        email,
        username,
        identity.firstName,
        identity.lastName,
        identity.country ?? null,
        identity.gender ?? null,
      ],
    );
    return mapRow(rows[0] as Parameters<typeof mapRow>[0]);
  } catch (err) {
    // A unique-violation here means the normalized email or username already
    // belongs to a DIFFERENT clerk user. Fail safely with a typed error rather
    // than silently overwriting another account.
    const e = err as { code?: string; constraint?: string; detail?: string };
    if (e.code === "23505") {
      const marker = `${e.constraint ?? ""} ${e.detail ?? ""}`.toLowerCase();
      if (marker.includes("username")) {
        throw new SyncError("username_collision", "Username already in use by another account");
      }
      if (marker.includes("email")) {
        throw new SyncError("email_collision", "Email already in use by another account");
      }
    }
    throw err;
  }
}

/** Resolve the current request's application user, syncing from the identity provider. */
export async function getCurrentAppUser(conn: Queryable = db): Promise<AppUser | null> {
  const identity = await resolveExternalIdentity();
  if (!identity) return null;
  // Routine per-request sync: non-authoritative so it never clobbers /account edits.
  // Note: sync NEVER writes deactivated_at, so a routine sync cannot reactivate a
  // deactivated account even if a Clerk session is still live.
  return syncAppUser(identity, conn, { authoritative: false });
}

/**
 * The current request's user ONLY when the account is active (signed in AND not
 * deactivated). This is the single boundary protected learner READ pages use to
 * decide access; a deactivated session resolves to null so those pages deny
 * access. The /account page deliberately uses getCurrentAppUser instead, so it
 * can render the "account closed" notice + sign-out for a deactivated user.
 */
export async function getActiveAppUser(conn: Queryable = db): Promise<AppUser | null> {
  const user = await getCurrentAppUser(conn);
  return user && !user.deactivated ? user : null;
}

/**
 * Controlled server-side admin promotion (used by the bootstrap script/migration).
 * Matches on the normalized email, uses a parameterized query, and returns the
 * number of rows changed so callers can refuse a missing user.
 */
export async function promoteToAdmin(email: string, conn: Queryable = db): Promise<number> {
  const normalized = normalizeEmail(email);
  const res = await conn.query(`UPDATE app_users SET role = 'admin' WHERE lower(email) = $1`, [
    normalized,
  ]);
  return res.rowCount ?? 0;
}
