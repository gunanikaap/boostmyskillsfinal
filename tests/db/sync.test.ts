import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { syncAppUser, promoteToAdmin, getCurrentAppUser } from "@/lib/auth/appUser";
import { SyncError } from "@/lib/auth/normalize";
import { setTestActor } from "@/lib/auth/identity";
import type { ExternalIdentity } from "@/lib/auth/identity";
import { resetDb, teardown } from "@/tests/helpers/db";

beforeEach(resetDb);
afterAll(teardown);

function identity(
  over: Partial<ExternalIdentity> & { clerkUserId: string; email: string },
): ExternalIdentity {
  return { username: null, firstName: null, lastName: null, ...over };
}

describe("Clerk sync — normalization", () => {
  it("1. normalizes email on insert (trim + lowercase)", async () => {
    const u = await syncAppUser(identity({ clerkUserId: "c1", email: "  Alice@Example.COM " }));
    expect(u.email).toBe("alice@example.com");
  });

  it("2. normalizes email on update (re-sync with different case)", async () => {
    await syncAppUser(identity({ clerkUserId: "c2", email: "bob@example.com" }));
    const u = await syncAppUser(identity({ clerkUserId: "c2", email: "BOB@EXAMPLE.com" }));
    expect(u.email).toBe("bob@example.com");
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE clerk_user_id='c2'`,
    );
    expect(count.rows[0]!.c).toBe(1);
  });

  it("3. normalizes username on insert; blank username becomes NULL not ''", async () => {
    const u = await syncAppUser(
      identity({ clerkUserId: "c3", email: "c3@example.com", username: "  CoolCat  " }),
    );
    expect(u.username).toBe("coolcat");
    const blank = await syncAppUser(
      identity({ clerkUserId: "c3b", email: "c3b@example.com", username: "   " }),
    );
    expect(blank.username).toBeNull();
  });
});

describe("Clerk sync — collisions and missing data (typed, safe failures)", () => {
  it("4. rejects a case-insensitive email collision from a different clerk user", async () => {
    await syncAppUser(identity({ clerkUserId: "c4a", email: "dup@example.com" }));
    await expect(
      syncAppUser(identity({ clerkUserId: "c4b", email: "DUP@EXAMPLE.COM" })),
    ).rejects.toMatchObject({ code: "email_collision" });
    const count = await getPool().query(`SELECT count(*)::int c FROM app_users`);
    expect(count.rows[0]!.c).toBe(1); // no bad second row
  });

  it("5. rejects a case-insensitive username collision from a different clerk user", async () => {
    await syncAppUser(
      identity({ clerkUserId: "c5a", email: "c5a@example.com", username: "shared" }),
    );
    await expect(
      syncAppUser(identity({ clerkUserId: "c5b", email: "c5b@example.com", username: "SHARED" })),
    ).rejects.toMatchObject({ code: "username_collision" });
  });

  it("6. rejects a missing primary email and writes no row", async () => {
    await expect(syncAppUser(identity({ clerkUserId: "c6", email: "   " }))).rejects.toBeInstanceOf(
      SyncError,
    );
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE clerk_user_id='c6'`,
    );
    expect(count.rows[0]!.c).toBe(0);
  });

  it("7. repeated event / upsert is idempotent", async () => {
    const id = identity({ clerkUserId: "c7", email: "c7@example.com", username: "seven" });
    await syncAppUser(id);
    await syncAppUser(id);
    await syncAppUser(id);
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE clerk_user_id='c7'`,
    );
    expect(count.rows[0]!.c).toBe(1);
  });
});

describe("Clerk sync — role integrity", () => {
  it("8. preserves an existing Admin role across user.updated", async () => {
    await syncAppUser(identity({ clerkUserId: "c8", email: "c8@example.com", firstName: "A" }));
    await promoteToAdmin("c8@example.com");
    const updated = await syncAppUser(
      identity({ clerkUserId: "c8", email: "c8@example.com", firstName: "Changed" }),
    );
    expect(updated.role).toBe("admin"); // not demoted
    expect(updated.firstName).toBe("Changed"); // other fields still sync
  });

  it("9. a new user is always learner (browser-supplied role ignored — no role input exists)", async () => {
    const u = await syncAppUser(identity({ clerkUserId: "c9", email: "c9@example.com" }));
    expect(u.role).toBe("learner");
  });

  it("10. ordinary Clerk metadata cannot promote/demote — sync has no role channel", async () => {
    // syncAppUser accepts no role/metadata field; even a full re-sync of a
    // promoted admin (simulating a user.updated carrying arbitrary metadata)
    // leaves role unchanged.
    await syncAppUser(identity({ clerkUserId: "c10", email: "c10@example.com" }));
    await promoteToAdmin("c10@example.com");
    // Simulate the lazy path (test adapter) with the same identity — no metadata
    // can flow into role.
    setTestActor(
      identity({ clerkUserId: "c10", email: "c10@example.com", username: "admin_meta" }),
    );
    const viaLazy = await getCurrentAppUser();
    expect(viaLazy?.role).toBe("admin");
  });
});
