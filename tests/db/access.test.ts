import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  requireAdmin,
  requireAuthenticatedUser,
  requirePublishedCredentialAccess,
  requireCredentialContentAccess,
  requireMaintenanceAllowed,
} from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { getCurrentAppUser, promoteToAdmin } from "@/lib/auth/appUser";
import { setTestActor } from "@/lib/auth/identity";
import { setMaintenance } from "@/lib/settings/maintenance";
import { resetDb, teardown } from "@/tests/helpers/db";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";
import { makeProject, makeCredential, makeUser } from "@/tests/helpers/factories";
import { getPool } from "@/lib/db/pool";

beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

describe("requireAdmin / requireAuthenticatedUser", () => {
  it("denies an anonymous user the admin boundary", async () => {
    await expect(requireAdmin()).rejects.toMatchObject({ kind: "unauthenticated" });
  });

  it("denies a learner the admin boundary", async () => {
    await actAs("learner");
    await expect(requireAdmin()).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("allows an admin", async () => {
    await actAs("admin");
    const user = await requireAdmin();
    expect(user.role).toBe("admin");
  });

  it("ignores a browser-supplied role — sync never elevates", async () => {
    // A brand-new identity syncs as learner regardless of any client claim.
    setTestActor({
      clerkUserId: "clerk_new_1",
      email: "new1@example.com",
      username: null,
      firstName: null,
      lastName: null,
    });
    const user = await getCurrentAppUser();
    expect(user?.role).toBe("learner");
    // Server-side promotion is the only way to become admin; re-sync preserves it.
    await promoteToAdmin("new1@example.com");
    const again = await getCurrentAppUser();
    expect(again?.role).toBe("admin");
  });
});

describe("credential access guards", () => {
  it("treats draft as not_found and hidden as hidden; published passes", async () => {
    const project = await makeProject();
    const draft = await makeCredential(project, "draft");
    const hidden = await makeCredential(project, "hidden");
    const published = await makeCredential(project, "published");

    await expect(requirePublishedCredentialAccess(draft)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(requirePublishedCredentialAccess(hidden)).rejects.toMatchObject({
      kind: "hidden",
    });
    const ok = await requirePublishedCredentialAccess(published);
    expect(ok.status).toBe("published");
  });

  it("blocks content access to a hidden credential even for an enrolled learner", async () => {
    const { userId } = await actAs("learner");
    const project = await makeProject();
    const cred = await makeCredential(project, "published");
    // publish a version and enrol
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO credential_versions
        (credential_id, revision_number, status, schema_version, title, author_name,
         about_content, content_document, grading_document, certification_rule, source_metadata, published_at)
       VALUES ($1,1,'published',1,'T','A','{}','{}','{}','{}','{"sourceType":"native"}', now())
       RETURNING id`,
      [cred],
    );
    await getPool().query(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3)`,
      [userId, cred, rows[0]!.id],
    );
    // published → content access ok
    await expect(requireCredentialContentAccess(cred)).resolves.toBeTruthy();
    // hide it → content access blocked, enrolment still exists
    await getPool().query(
      `UPDATE micro_credentials SET status='hidden', hidden_at=now() WHERE id=$1`,
      [cred],
    );
    await expect(requireCredentialContentAccess(cred)).rejects.toMatchObject({ kind: "hidden" });
    const enr = await getPool().query(
      `SELECT id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [userId, cred],
    );
    expect(enr.rowCount).toBe(1); // preserved
  });
});

describe("maintenance gate", () => {
  it("blocks non-admins off the home page, allows home + admins", async () => {
    const admin = await makeUser("admin");
    await setMaintenance({ enabled: true, adminUserId: admin });

    // anonymous learner on a normal page → maintenance
    await expect(
      requireMaintenanceAllowed({ user: null, isHomePath: false, isAdminPath: false }),
    ).rejects.toMatchObject({ kind: "maintenance" });
    // home stays open
    await expect(
      requireMaintenanceAllowed({ user: null, isHomePath: true, isAdminPath: false }),
    ).resolves.toBeUndefined();
    // admin bypasses everywhere
    const adminUser = {
      id: admin,
      role: "admin" as const,
      clerkUserId: "",
      email: "",
      username: null,
      firstName: null,
      lastName: null,
      country: null,
      gender: null,
    };
    await expect(
      requireMaintenanceAllowed({ user: adminUser, isHomePath: false, isAdminPath: true }),
    ).resolves.toBeUndefined();
  });

  it("allows everything when maintenance is off", async () => {
    await expect(
      requireMaintenanceAllowed({ user: null, isHomePath: false, isAdminPath: false }),
    ).resolves.toBeUndefined();
  });
});
