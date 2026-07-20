import { db, type Queryable } from "@/lib/db/pool";
import { z } from "zod";

/**
 * Migration-readiness services. These are IDEMPOTENT upserts with a dry-run mode
 * and reconciliation reporting. They NEVER invent data: with no source export
 * present, the dry-run reports UNAVAILABLE (null counts) rather than 0, and
 * historical migration acceptance stays externally blocked (see docs/migration).
 */

export const legacyUserSchema = z.object({
  externalRef: z.string().min(1), // legacy LMS user id — preserved for reconciliation
  email: z.string().email(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  clerkUserId: z.string().nullable().optional(), // resolved via the Clerk migration (blocked until strategy exists)
});
export type LegacyUser = z.infer<typeof legacyUserSchema>;

export interface UpsertReport {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  unresolved: string[]; // externalRefs that could not be applied (e.g. no clerk mapping)
  dryRun: boolean;
}

/**
 * Upsert legacy users. Matching is by external_ref first, then email. Newer
 * application data is never silently overwritten: existing rows are only updated
 * for null/empty profile fields. Rows lacking a Clerk mapping are recorded as
 * unresolved (authentication cannot be attached yet) but never fabricated.
 */
export async function upsertUsers(
  records: unknown[],
  opts: { dryRun: boolean },
  conn: Queryable = db,
): Promise<UpsertReport> {
  const report: UpsertReport = {
    total: records.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    unresolved: [],
    dryRun: opts.dryRun,
  };

  for (const raw of records) {
    const parsed = legacyUserSchema.safeParse(raw);
    if (!parsed.success) {
      report.skipped += 1;
      continue;
    }
    const u = parsed.data;

    const existing = await conn.query(
      `SELECT id, clerk_user_id FROM app_users WHERE external_ref = $1 OR email = $2 LIMIT 1`,
      [u.externalRef, u.email],
    );

    if (existing.rows[0]) {
      if (!opts.dryRun) {
        await conn.query(
          `UPDATE app_users SET
             first_name = COALESCE(first_name, $2),
             last_name = COALESCE(last_name, $3),
             external_ref = COALESCE(external_ref, $4)
           WHERE id = $1`,
          [
            (existing.rows[0] as { id: string }).id,
            u.firstName ?? null,
            u.lastName ?? null,
            u.externalRef,
          ],
        );
      }
      report.updated += 1;
      continue;
    }

    // A brand-new user requires a Clerk identity to authenticate. Without one we
    // cannot create a usable account — record as unresolved rather than invent it.
    if (!u.clerkUserId) {
      report.unresolved.push(u.externalRef);
      report.skipped += 1;
      continue;
    }

    if (!opts.dryRun) {
      await conn.query(
        `INSERT INTO app_users (clerk_user_id, email, first_name, last_name, role, external_ref)
         VALUES ($1,$2,$3,$4,'learner',$5)
         ON CONFLICT (clerk_user_id) DO NOTHING`,
        [u.clerkUserId, u.email, u.firstName ?? null, u.lastName ?? null, u.externalRef],
      );
    }
    report.inserted += 1;
  }

  return report;
}
