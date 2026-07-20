import { db, type Queryable } from "@/lib/db/pool";
import { resolveExternalIdentity, type ExternalIdentity } from "@/lib/auth/identity";

export type AppRole = "learner" | "admin";

export interface AppUser {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: AppRole;
}

function mapRow(r: {
  id: string;
  clerk_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
}): AppUser {
  return {
    id: r.id,
    clerkUserId: r.clerk_user_id,
    email: r.email,
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
  const { rows } = await conn.query(
    `INSERT INTO app_users (clerk_user_id, email, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, 'learner')
     ON CONFLICT (clerk_user_id) DO UPDATE
       SET email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name
     RETURNING id, clerk_user_id, email, first_name, last_name, role`,
    [identity.clerkUserId, identity.email, identity.firstName, identity.lastName],
  );
  return mapRow(rows[0] as Parameters<typeof mapRow>[0]);
}

/** Resolve the current request's application user, syncing from the identity provider. */
export async function getCurrentAppUser(conn: Queryable = db): Promise<AppUser | null> {
  const identity = await resolveExternalIdentity();
  if (!identity) return null;
  return syncAppUser(identity, conn);
}

/** Controlled server-side admin promotion (used by an admin bootstrap script/migration). */
export async function promoteToAdmin(email: string, conn: Queryable = db): Promise<void> {
  await conn.query(`UPDATE app_users SET role = 'admin' WHERE email = $1`, [email]);
}
