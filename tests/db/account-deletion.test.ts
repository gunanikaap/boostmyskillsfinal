import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  requestAccountDeletion,
  approveDeletionRequest,
  rejectDeletionRequest,
  getMyDeletionRequest,
  DeletionError,
} from "@/lib/account/deletion";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

async function insertRawRequest(userId: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO account_deletion_requests (user_id) VALUES ($1) RETURNING id`,
    [userId],
  );
  return rows[0]!.id;
}
async function isDeactivated(userId: string): Promise<boolean> {
  const { rows } = await getPool().query(`SELECT deactivated_at FROM app_users WHERE id = $1`, [
    userId,
  ]);
  return rows[0]!.deactivated_at != null;
}

describe("account deletion policy", () => {
  it("an active learner can raise a request; a repeat returns the same pending one", async () => {
    const learner = await makeUser("learner");
    const a = await requestAccountDeletion(learner, "leaving");
    expect(a.status).toBe("pending");
    const b = await requestAccountDeletion(learner, "again");
    expect(b.id).toBe(a.id);
  });

  it("an admin cannot use the self-service deletion queue", async () => {
    const admin = await makeUser("admin");
    await expect(requestAccountDeletion(admin, "x")).rejects.toBeInstanceOf(DeletionError);
  });

  it("a deactivated account cannot raise a request", async () => {
    const learner = await makeUser("learner");
    await getPool().query(`UPDATE app_users SET deactivated_at = now() WHERE id = $1`, [learner]);
    await expect(requestAccountDeletion(learner, "x")).rejects.toBeInstanceOf(DeletionError);
  });

  it("bounds the reason length", async () => {
    const learner = await makeUser("learner");
    const r = await requestAccountDeletion(learner, "z".repeat(5000));
    expect((r.reason ?? "").length).toBeLessThanOrEqual(2000);
  });

  it("approval deactivates a learner (exactly one row), tombstones identity, keeps the row", async () => {
    const learner = await makeUser("learner");
    const admin = await makeUser("admin");
    const req = await requestAccountDeletion(learner, "bye");
    await approveDeletionRequest(req.id, admin, "confirmed");
    expect(await isDeactivated(learner)).toBe(true);
    const { rows } = await getPool().query(
      `SELECT status, resolved_by FROM account_deletion_requests WHERE id = $1`,
      [req.id],
    );
    expect(rows[0]!.status).toBe("approved");
    expect(rows[0]!.resolved_by).toBe(admin);
    // Row is preserved (not deleted) so certificates/enrolments stay intact.
    const cnt = await getPool().query(`SELECT count(*)::int n FROM app_users WHERE id = $1`, [
      learner,
    ]);
    expect(cnt.rows[0]!.n).toBe(1);
    // Email/username released for reuse.
    const u = await getPool().query(`SELECT email, username FROM app_users WHERE id = $1`, [
      learner,
    ]);
    expect(u.rows[0]!.email).toMatch(/@deleted\.invalid$/);
    expect(u.rows[0]!.username).toBeNull();
  });

  it("an admin cannot approve their own request", async () => {
    const admin = await makeUser("admin");
    const reqId = await insertRawRequest(admin); // bypass the learner-only guard for the test
    await expect(approveDeletionRequest(reqId, admin)).rejects.toBeInstanceOf(DeletionError);
    expect(await isDeactivated(admin)).toBe(false);
  });

  it("cannot approve an admin target through this queue", async () => {
    const targetAdmin = await makeUser("admin");
    const approver = await makeUser("admin");
    const reqId = await insertRawRequest(targetAdmin);
    await expect(approveDeletionRequest(reqId, approver)).rejects.toBeInstanceOf(DeletionError);
    expect(await isDeactivated(targetAdmin)).toBe(false);
  });

  it("a deactivated admin cannot approve", async () => {
    const learner = await makeUser("learner");
    const admin = await makeUser("admin");
    const req = await requestAccountDeletion(learner, "bye");
    await getPool().query(`UPDATE app_users SET deactivated_at = now() WHERE id = $1`, [admin]);
    await expect(approveDeletionRequest(req.id, admin)).rejects.toBeInstanceOf(DeletionError);
    expect(await isDeactivated(learner)).toBe(false);
  });

  it("a resolved request cannot be approved again (idempotent guard)", async () => {
    const learner = await makeUser("learner");
    const admin = await makeUser("admin");
    const req = await requestAccountDeletion(learner, "bye");
    await approveDeletionRequest(req.id, admin);
    await expect(approveDeletionRequest(req.id, admin)).rejects.toBeInstanceOf(DeletionError);
  });

  it("reject leaves the account active and cannot be self-resolved", async () => {
    const learner = await makeUser("learner");
    const admin = await makeUser("admin");
    const req = await requestAccountDeletion(learner, "bye");
    await rejectDeletionRequest(req.id, admin, "not now");
    expect(await isDeactivated(learner)).toBe(false);
    const cur = await getMyDeletionRequest(learner);
    expect(cur?.status).toBe("rejected");
    // A resolved request cannot be rejected again.
    await expect(rejectDeletionRequest(req.id, admin)).rejects.toBeInstanceOf(DeletionError);
  });
});
