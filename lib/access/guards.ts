import { db, type Queryable } from "@/lib/db/pool";
import { getCurrentAppUser, type AppUser } from "@/lib/auth/appUser";
import { getMaintenance } from "@/lib/settings/maintenance";
import { AccessError } from "@/lib/access/errors";

/**
 * The single set of server-side authorization functions. EVERY admin page,
 * route handler, server action, import/export/report/settings/publish/hide
 * operation must call requireAdmin(). Client-side hiding of admin nav is a
 * usability measure only — never the authorization boundary.
 *
 * None of these trust user IDs, roles, enrolment IDs, unit IDs, scores or
 * ownership values supplied by the browser: identity comes from the auth
 * provider and role/ownership come from the database.
 */

export async function requireAuthenticatedUser(conn: Queryable = db): Promise<AppUser> {
  const user = await getCurrentAppUser(conn);
  if (!user) throw new AccessError("unauthenticated");
  return user;
}

export async function requireAdmin(conn: Queryable = db): Promise<AppUser> {
  const user = await requireAuthenticatedUser(conn);
  if (user.role !== "admin") throw new AccessError("forbidden", "admin role required");
  return user;
}

export interface EnrollmentRow {
  id: string;
  status: string;
  credentialVersionId: string | null;
}

/** The current user must hold a credential enrolment for `credentialId`. */
export async function requireCredentialEnrollment(
  credentialId: string,
  conn: Queryable = db,
): Promise<{ user: AppUser; enrollment: EnrollmentRow }> {
  const user = await requireAuthenticatedUser(conn);
  const { rows } = await conn.query(
    `SELECT id, status, credential_version_id
     FROM enrollments
     WHERE user_id = $1 AND credential_id = $2`,
    [user.id, credentialId],
  );
  const row = rows[0] as
    { id: string; status: string; credential_version_id: string | null } | undefined;
  if (!row) throw new AccessError("forbidden", "not enrolled");
  return {
    user,
    enrollment: { id: row.id, status: row.status, credentialVersionId: row.credential_version_id },
  };
}

interface CredentialStatusRow {
  id: string;
  status: "draft" | "published" | "hidden";
}

/**
 * Public/learner content access to a credential. Draft or missing → not_found.
 * Hidden → hidden (mapped to 404 publicly). Only 'published' passes.
 * Admin content review uses requireAdmin() paths, not this function.
 */
export async function requirePublishedCredentialAccess(
  credentialId: string,
  conn: Queryable = db,
): Promise<CredentialStatusRow> {
  const { rows } = await conn.query(`SELECT id, status FROM micro_credentials WHERE id = $1`, [
    credentialId,
  ]);
  const row = rows[0] as CredentialStatusRow | undefined;
  if (!row || row.status === "draft") throw new AccessError("not_found");
  if (row.status === "hidden") throw new AccessError("hidden");
  return row;
}

/**
 * Learner content access to a credential's units: the credential must be
 * published (hidden blocks even enrolled learners from content) AND the user
 * must be enrolled. Enrolment/progress/attempts remain preserved when hidden —
 * this only gates live content access.
 */
export async function requireCredentialContentAccess(
  credentialId: string,
  conn: Queryable = db,
): Promise<{ user: AppUser; enrollment: EnrollmentRow }> {
  await requirePublishedCredentialAccess(credentialId, conn); // throws hidden/not_found
  return requireCredentialEnrollment(credentialId, conn);
}

export async function requireProgrammeAccess(
  programmeId: string,
  conn: Queryable = db,
): Promise<CredentialStatusRow> {
  const { rows } = await conn.query(`SELECT id, status FROM micro_programmes WHERE id = $1`, [
    programmeId,
  ]);
  const row = rows[0] as CredentialStatusRow | undefined;
  if (!row || row.status === "draft") throw new AccessError("not_found");
  if (row.status === "hidden") throw new AccessError("hidden");
  return row;
}

/**
 * Maintenance-mode gate. When maintenance is on, only the home page stays open
 * to everyone, and admins retain full access; every other page/write is blocked
 * for non-admins with a maintenance error. Enforced server-side (not client nav).
 */
export async function requireMaintenanceAllowed(
  opts: { user: AppUser | null; isHomePath: boolean; isAdminPath: boolean },
  conn: Queryable = db,
): Promise<void> {
  const { maintenanceMode } = await getMaintenance(conn);
  if (!maintenanceMode) return;
  if (opts.user?.role === "admin") return; // admins bypass entirely
  if (opts.isHomePath) return; // home stays available to everyone
  if (opts.isAdminPath) throw new AccessError("forbidden");
  throw new AccessError("maintenance");
}
