import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import type { DeletionStatus, DeletionRequest, AdminDeletionRequest } from "@/lib/account/types";

export type { DeletionStatus, DeletionRequest, AdminDeletionRequest } from "@/lib/account/types";

/**
 * Admin-approved account deletion — SERVER ONLY (pure types live in ./types).
 *
 * A learner can't delete their own account outright. They raise a request, which
 * an administrator reviews and either approves or rejects. On approval the
 * account is DEACTIVATED (app_users.deactivated_at set) — not hard-deleted — so
 * certificates, enrolments and audit history that reference the user remain
 * intact. When Clerk is configured we also best-effort remove the Clerk user so
 * the person can no longer authenticate; a Clerk failure never blocks approval.
 */

export class DeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeletionError";
  }
}

// Bounds for free-text fields.
const MAX_REASON = 2000;
const MAX_NOTE = 1000;

function mapRequest(r: {
  id: string;
  status: DeletionStatus;
  reason: string | null;
  admin_note: string | null;
  requested_at: string;
  resolved_at: string | null;
}): DeletionRequest {
  return {
    id: r.id,
    status: r.status,
    reason: r.reason,
    adminNote: r.admin_note,
    requestedAt: r.requested_at,
    resolvedAt: r.resolved_at,
  };
}

/** The current user's most recent deletion request, if any. */
export async function getMyDeletionRequest(
  userId: string,
  conn: Queryable = db,
): Promise<DeletionRequest | null> {
  const { rows } = await conn.query(
    `SELECT id, status, reason, admin_note, requested_at, resolved_at
     FROM account_deletion_requests
     WHERE user_id = $1
     ORDER BY requested_at DESC
     LIMIT 1`,
    [userId],
  );
  const r = rows[0] as Parameters<typeof mapRequest>[0] | undefined;
  return r ? mapRequest(r) : null;
}

/**
 * Raise a self-service deletion request. Only an ACTIVE LEARNER may use this
 * queue — administrator accounts cannot be deleted here (admin removal is a
 * separate controlled operational procedure). If one is already pending, that
 * one is returned.
 */
export async function requestAccountDeletion(
  userId: string,
  reason: string,
  conn: Queryable = db,
): Promise<DeletionRequest> {
  const trimmed = reason.trim().slice(0, MAX_REASON);
  const who = await conn.query(`SELECT role, deactivated_at FROM app_users WHERE id = $1`, [
    userId,
  ]);
  const u = who.rows[0] as { role: string; deactivated_at: string | null } | undefined;
  if (!u) throw new DeletionError("Account not found.");
  if (u.deactivated_at != null) throw new DeletionError("This account is already closed.");
  if (u.role !== "learner") {
    throw new DeletionError("Administrator accounts cannot be deleted through this workflow.");
  }
  try {
    const { rows } = await conn.query(
      `INSERT INTO account_deletion_requests (user_id, reason)
       VALUES ($1, $2)
       RETURNING id, status, reason, admin_note, requested_at, resolved_at`,
      [userId, trimmed || null],
    );
    return mapRequest(rows[0] as Parameters<typeof mapRequest>[0]);
  } catch (err) {
    // Unique partial index: a pending request already exists → return it.
    if ((err as { code?: string }).code === "23505") {
      const existing = await getMyDeletionRequest(userId, conn);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Withdraw the current user's own pending request. */
export async function cancelMyDeletionRequest(userId: string, conn: Queryable = db): Promise<void> {
  await conn.query(
    `UPDATE account_deletion_requests
     SET status = 'cancelled', resolved_at = now()
     WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
}

/** All deletion requests for the admin queue — pending first, then newest. */
export async function listDeletionRequests(conn: Queryable = db): Promise<AdminDeletionRequest[]> {
  const { rows } = await conn.query(
    `SELECT r.id, r.status, r.reason, r.admin_note, r.requested_at, r.resolved_at,
            r.user_id,
            COALESCE(u.profile->>'deletedEmail', u.email) AS email,
            COALESCE(u.username, u.profile->>'deletedUsername') AS username,
            u.first_name, u.last_name, u.deactivated_at
     FROM account_deletion_requests r
     JOIN app_users u ON u.id = r.user_id
     ORDER BY (r.status = 'pending') DESC, r.requested_at DESC`,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    ...mapRequest(r as Parameters<typeof mapRequest>[0]),
    userId: r.user_id as string,
    email: r.email as string,
    username: (r.username as string) ?? null,
    fullName: `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim(),
    deactivated: r.deactivated_at != null,
  }));
}

async function deleteClerkUser(clerkUserId: string): Promise<void> {
  if (!clerkConfigured() || !process.env.CLERK_SECRET_KEY) return;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.users.deleteUser(clerkUserId);
  } catch {
    // Best effort — the account is already deactivated in our DB, which is the
    // authoritative access gate. A Clerk removal failure must not fail approval.
  }
}

/**
 * Approve a pending deletion request: mark it approved and deactivate the
 * account. Returns the clerk_user_id so the caller can trigger the (best-effort)
 * Clerk removal outside the transaction.
 */
export async function approveDeletionRequest(
  requestId: string,
  adminUserId: string,
  note?: string,
): Promise<void> {
  const trimmedNote = note?.trim().slice(0, MAX_NOTE) || null;
  const clerkUserId = await withTransaction(async (tx) => {
    // Lock the request row and load the target's role + status.
    const { rows } = await tx.query(
      `SELECT r.user_id, u.clerk_user_id, u.role AS target_role, u.deactivated_at AS target_deactivated
       FROM account_deletion_requests r
       JOIN app_users u ON u.id = r.user_id
       WHERE r.id = $1 AND r.status = 'pending'
       FOR UPDATE OF r`,
      [requestId],
    );
    const row = rows[0] as
      | {
          user_id: string;
          clerk_user_id: string;
          target_role: string;
          target_deactivated: string | null;
        }
      | undefined;
    if (!row) throw new DeletionError("This request is no longer pending.");
    // An admin may not approve their own request.
    if (row.user_id === adminUserId) {
      throw new DeletionError("You cannot approve your own deletion request.");
    }
    // Only a learner account may be closed through this queue, and only if active.
    if (row.target_role !== "learner") {
      throw new DeletionError("Only learner accounts can be closed through this workflow.");
    }
    if (row.target_deactivated != null) {
      throw new DeletionError("The target account is already closed.");
    }
    // The resolver must be an ACTIVE administrator.
    const res = await tx.query(`SELECT role, deactivated_at FROM app_users WHERE id = $1`, [
      adminUserId,
    ]);
    const admin = res.rows[0] as { role: string; deactivated_at: string | null } | undefined;
    if (!admin || admin.role !== "admin" || admin.deactivated_at != null) {
      throw new DeletionError("Only an active administrator can approve deletion requests.");
    }

    await tx.query(
      `UPDATE account_deletion_requests
       SET status = 'approved', admin_note = $2, resolved_at = now(), resolved_by = $3
       WHERE id = $1`,
      [requestId, trimmedNote, adminUserId],
    );
    // Deactivate AND release the email/username so the person can register again
    // with the same address later. The app_users row is kept (certificates and
    // enrolments reference it), but its unique identifiers are tombstoned; the
    // originals are stashed in `profile` for the admin audit trail. The guarded
    // WHERE must affect exactly one row or the whole approval rolls back.
    const upd = await tx.query(
      `UPDATE app_users
       SET deactivated_at = now(),
           profile = profile
             || jsonb_build_object('deletedEmail', email)
             || CASE WHEN username IS NOT NULL
                     THEN jsonb_build_object('deletedUsername', username)
                     ELSE '{}'::jsonb END,
           email = 'deleted+' || id::text || '@deleted.invalid',
           username = NULL
       WHERE id = $1 AND deactivated_at IS NULL AND role = 'learner'`,
      [row.user_id],
    );
    if ((upd.rowCount ?? 0) !== 1) {
      throw new DeletionError("Could not deactivate the target account.");
    }
    return row.clerk_user_id;
  });

  // Best-effort external removal; DB deactivation above is the authoritative gate.
  await deleteClerkUser(clerkUserId);
}

/** Reject a pending deletion request; the account stays fully active. */
export async function rejectDeletionRequest(
  requestId: string,
  adminUserId: string,
  note?: string,
): Promise<void> {
  const trimmedNote = note?.trim().slice(0, MAX_NOTE) || null;
  await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT user_id FROM account_deletion_requests
       WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [requestId],
    );
    const row = rows[0] as { user_id: string } | undefined;
    if (!row) throw new DeletionError("This request is no longer pending.");
    if (row.user_id === adminUserId) {
      throw new DeletionError("You cannot resolve your own deletion request.");
    }
    const res = await tx.query(`SELECT role, deactivated_at FROM app_users WHERE id = $1`, [
      adminUserId,
    ]);
    const admin = res.rows[0] as { role: string; deactivated_at: string | null } | undefined;
    if (!admin || admin.role !== "admin" || admin.deactivated_at != null) {
      throw new DeletionError("Only an active administrator can reject deletion requests.");
    }
    await tx.query(
      `UPDATE account_deletion_requests
       SET status = 'rejected', admin_note = $2, resolved_at = now(), resolved_by = $3
       WHERE id = $1 AND status = 'pending'`,
      [requestId, trimmedNote, adminUserId],
    );
  });
}
