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
}

function mapRow(r: {
  id: string;
  clerk_user_id: string;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
}): AppUser {
  return {
    id: r.id,
    clerkUserId: r.clerk_user_id,
    email: r.email,
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
  };
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
): Promise<AppUser> {
  const email = normalizeEmail(identity.email);
  // A missing primary email is a typed, safe failure — never write an empty
  // string or an otherwise unusable app_users row.
  if (email === "") {
    throw new SyncError("missing_email", "Cannot synchronize a user without a primary email");
  }
  const username = normalizeUsername(identity.username);

  try {
    const { rows } = await conn.query(
      `INSERT INTO app_users (clerk_user_id, email, username, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, 'learner')
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET email = EXCLUDED.email,
             username = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, clerk_user_id, email, username, first_name, last_name, role`,
      [identity.clerkUserId, email, username, identity.firstName, identity.lastName],
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
  return syncAppUser(identity, conn);
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
