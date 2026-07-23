import { afterEach, describe, expect, it } from "vitest";
import { parseTestActorHeader, setTestActor } from "@/lib/auth/identity";
import { testAuthEnabled } from "@/lib/env";

/**
 * Security unit tests for the cross-process test-auth adapter that powers the
 * authenticated Playwright vertical. The adapter is a hard boundary: it may only
 * ever resolve an identity when (a) APP_ENV === "test" (gated by testAuthEnabled)
 * AND (b) the request presents the exact server-side secret. These tests prove it
 * is inert in every other case, so no header/cookie/browser value can forge an
 * identity in local, uat, or production.
 */

const SECRET = "s3cr3t-e2e-token";
const ACTOR = JSON.stringify({
  clerkUserId: "e2e_admin",
  email: "admin@example.com",
  username: "adminE2E",
  firstName: "E2E",
  lastName: "Admin",
});

describe("parseTestActorHeader (secret gate)", () => {
  it("resolves a full identity when the secret matches and payload is well-formed", () => {
    expect(parseTestActorHeader(SECRET, ACTOR, SECRET)).toEqual({
      clerkUserId: "e2e_admin",
      email: "admin@example.com",
      username: "adminE2E",
      firstName: "E2E",
      lastName: "Admin",
    });
  });

  it("returns null when no server secret is configured (adapter inert)", () => {
    expect(parseTestActorHeader(SECRET, ACTOR, undefined)).toBeNull();
    expect(parseTestActorHeader(SECRET, ACTOR, "")).toBeNull();
  });

  it("returns null when the presented secret is wrong or absent", () => {
    expect(parseTestActorHeader("wrong", ACTOR, SECRET)).toBeNull();
    expect(parseTestActorHeader(null, ACTOR, SECRET)).toBeNull();
  });

  it("returns null when the actor header is missing", () => {
    expect(parseTestActorHeader(SECRET, null, SECRET)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseTestActorHeader(SECRET, "{not json", SECRET)).toBeNull();
  });

  it("returns null when a required field is missing or the wrong type", () => {
    expect(parseTestActorHeader(SECRET, JSON.stringify({ email: "a@b.c" }), SECRET)).toBeNull();
    expect(parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: "x" }), SECRET)).toBeNull();
    expect(
      parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: 1, email: "a@b.c" }), SECRET),
    ).toBeNull();
  });

  it("normalises optional fields to null when absent", () => {
    expect(
      parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: "u", email: "a@b.c" }), SECRET),
    ).toEqual({
      clerkUserId: "u",
      email: "a@b.c",
      username: null,
      firstName: null,
      lastName: null,
    });
  });

  it("rejects an empty/whitespace Clerk id or an email without '@'", () => {
    expect(
      parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: "", email: "a@b.c" }), SECRET),
    ).toBeNull();
    expect(
      parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: "   ", email: "a@b.c" }), SECRET),
    ).toBeNull();
    expect(
      parseTestActorHeader(
        SECRET,
        JSON.stringify({ clerkUserId: "u", email: "not-an-email" }),
        SECRET,
      ),
    ).toBeNull();
    expect(
      parseTestActorHeader(SECRET, JSON.stringify({ clerkUserId: "u", email: "" }), SECRET),
    ).toBeNull();
  });

  it("rejects an unsupported caller-supplied role, and never returns a role field", () => {
    // Unknown role → rejected outright (defence in depth).
    expect(
      parseTestActorHeader(
        SECRET,
        JSON.stringify({ clerkUserId: "u", email: "a@b.c", role: "superadmin" }),
        SECRET,
      ),
    ).toBeNull();
    // A known role is accepted structurally but NEVER carried into the identity —
    // authorization role comes only from the app_users row via syncAppUser.
    const id = parseTestActorHeader(
      SECRET,
      JSON.stringify({ clerkUserId: "u", email: "a@b.c", role: "admin" }),
      SECRET,
    );
    expect(id).not.toBeNull();
    expect(id).not.toHaveProperty("role");
  });
});

describe("APP_ENV gate around the whole adapter", () => {
  const original = process.env.APP_ENV;
  afterEach(() => {
    process.env.APP_ENV = original;
  });

  it("testAuthEnabled() is false outside APP_ENV=test, making the header path unreachable", () => {
    // Full environment matrix: only "test" may ever enable the adapter.
    for (const env of ["local", "development", "uat", "production"]) {
      process.env.APP_ENV = env;
      expect(testAuthEnabled(), `APP_ENV=${env} must not enable test-auth`).toBe(false);
    }
    process.env.APP_ENV = "test";
    // TEST_AUTH_ENABLED is set true by tests/setup.ts.
    expect(testAuthEnabled()).toBe(true);
  });

  it("requires BOTH gates: APP_ENV=test alone is not enough without TEST_AUTH_ENABLED", () => {
    const originalFlag = process.env.TEST_AUTH_ENABLED;
    process.env.APP_ENV = "test";
    try {
      for (const flag of [undefined, "", "false", "FALSE", "0", "yes", "1"]) {
        if (flag === undefined) delete process.env.TEST_AUTH_ENABLED;
        else process.env.TEST_AUTH_ENABLED = flag;
        expect(testAuthEnabled(), `TEST_AUTH_ENABLED=${String(flag)} must not enable`).toBe(false);
      }
      process.env.TEST_AUTH_ENABLED = "true";
      expect(testAuthEnabled()).toBe(true);
    } finally {
      if (originalFlag === undefined) delete process.env.TEST_AUTH_ENABLED;
      else process.env.TEST_AUTH_ENABLED = originalFlag;
    }
  });

  it("setTestActor() throws outside APP_ENV=test (no impersonation in real environments)", () => {
    for (const env of ["local", "development", "uat", "production"]) {
      process.env.APP_ENV = env;
      expect(() =>
        setTestActor({
          clerkUserId: "x",
          email: "x@example.test",
          username: null,
          firstName: null,
          lastName: null,
        }),
      ).toThrow(/APP_ENV=test/);
    }
  });
});
