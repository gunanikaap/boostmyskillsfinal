import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { getCurrentAppUser, getActiveAppUser, type AppUser } from "@/lib/auth/appUser";
import {
  requireAuthenticatedUser,
  requireAdmin,
  requireMaintenanceAllowed,
} from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { GET as certDownload } from "@/app/account/certificates/[code]/download/route";
import { resetDb, teardown } from "@/tests/helpers/db";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";

beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

async function deactivate(userId: string): Promise<void> {
  await getPool().query(`UPDATE app_users SET deactivated_at = now() WHERE id = $1`, [userId]);
}

describe("deactivated-account access boundary (AUTH-P1-001)", () => {
  it("requireAuthenticatedUser rejects a deactivated learner", async () => {
    const { userId } = await actAs("learner");
    await deactivate(userId);
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({ kind: "unauthenticated" });
  });

  it("getActiveAppUser returns null for a deactivated account, but getCurrentAppUser still resolves it", async () => {
    const { userId } = await actAs("learner");
    await deactivate(userId);
    expect(await getActiveAppUser()).toBeNull();
    const raw = await getCurrentAppUser();
    expect(raw?.deactivated).toBe(true); // account page needs this for the closure notice
  });

  it("a routine session sync never reactivates a deactivated account", async () => {
    const { userId } = await actAs("learner");
    await deactivate(userId);
    await getCurrentAppUser(); // triggers a sync
    await getCurrentAppUser(); // and again
    const { rows } = await getPool().query(`SELECT deactivated_at FROM app_users WHERE id = $1`, [
      userId,
    ]);
    expect(rows[0]!.deactivated_at).not.toBeNull();
  });

  it("private certificate download denies a deactivated learner with 401", async () => {
    const { userId } = await actAs("learner");
    await deactivate(userId);
    const res = await certDownload(new Request("http://x/account/certificates/abc/download"), {
      params: Promise.resolve({ code: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("requireAdmin rejects a deactivated admin", async () => {
    const { userId } = await actAs("admin");
    await deactivate(userId);
    await expect(requireAdmin()).rejects.toBeInstanceOf(AccessError);
  });

  it("a deactivated admin does NOT bypass maintenance; an active admin does", async () => {
    await getPool().query(`UPDATE platform_settings SET maintenance_mode = true WHERE id = 1`);
    const base: Omit<AppUser, "role" | "deactivated"> = {
      id: "00000000-0000-0000-0000-000000000000",
      clerkUserId: "c",
      email: "a@example.com",
      username: null,
      firstName: null,
      lastName: null,
      country: null,
      gender: null,
    };
    const activeAdmin: AppUser = { ...base, role: "admin", deactivated: false };
    const deadAdmin: AppUser = { ...base, role: "admin", deactivated: true };

    // Active admin bypasses on a non-home, non-admin path.
    await expect(
      requireMaintenanceAllowed({ user: activeAdmin, isHomePath: false, isAdminPath: false }),
    ).resolves.toBeUndefined();
    // Deactivated admin is blocked (treated as a normal blocked user).
    await expect(
      requireMaintenanceAllowed({ user: deadAdmin, isHomePath: false, isAdminPath: false }),
    ).rejects.toMatchObject({ kind: "maintenance" });
    // ...and denied on an admin path too.
    await expect(
      requireMaintenanceAllowed({ user: deadAdmin, isHomePath: false, isAdminPath: true }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});
