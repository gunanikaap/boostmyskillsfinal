import { afterEach, describe, expect, it } from "vitest";
import { parseTestActorHeader } from "@/lib/auth/identity";
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
});

describe("APP_ENV gate around the whole adapter", () => {
  const original = process.env.APP_ENV;
  afterEach(() => {
    process.env.APP_ENV = original;
  });

  it("testAuthEnabled() is false outside APP_ENV=test, making the header path unreachable", () => {
    for (const env of ["local", "uat", "production"]) {
      process.env.APP_ENV = env;
      expect(testAuthEnabled()).toBe(false);
    }
    process.env.APP_ENV = "test";
    // TEST_AUTH_ENABLED is set true by tests/setup.ts.
    expect(testAuthEnabled()).toBe(true);
  });
});
