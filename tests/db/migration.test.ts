import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { upsertUsers } from "@/lib/migration/service";
import { resetDb, teardown } from "@/tests/helpers/db";

beforeEach(resetDb);
afterAll(teardown);

describe("migration user upsert", () => {
  it("dry-run makes no writes but reports the plan", async () => {
    const records = [{ externalRef: "L1", email: "l1@example.com", clerkUserId: "clerk_l1" }];
    const report = await upsertUsers(records, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.inserted).toBe(1);
    const count = await getPool().query(`SELECT count(*)::int c FROM app_users`);
    expect(count.rows[0]!.c).toBe(0); // nothing written
  });

  it("apply is idempotent (re-running does not duplicate)", async () => {
    const records = [{ externalRef: "L2", email: "l2@example.com", clerkUserId: "clerk_l2" }];
    await upsertUsers(records, { dryRun: false });
    await upsertUsers(records, { dryRun: false });
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE external_ref='L2'`,
    );
    expect(count.rows[0]!.c).toBe(1);
  });

  it("records users without a Clerk mapping as unresolved (never fabricated)", async () => {
    const records = [{ externalRef: "L3", email: "l3@example.com" }]; // no clerkUserId
    const report = await upsertUsers(records, { dryRun: false });
    expect(report.unresolved).toContain("L3");
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE external_ref='L3'`,
    );
    expect(count.rows[0]!.c).toBe(0);
  });
});
