import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isExactTestEnvironment, testAuthEnabled, appEnv } from "@/lib/env";
import { parseTestActorHeader, setTestActor } from "@/lib/auth/identity";

/**
 * FCX-P0-001 — the test-authentication adapter must activate ONLY when the RAW
 * value of process.env.APP_ENV is exactly the lowercase string "test".
 *
 * The regression: lib/env.ts normalised APP_ENV with toLowerCase(), so
 * `APP_ENV=TEST` resolved to "test" and could enable test authentication. Every
 * test-auth entry point now gates on the raw value independently.
 */

const SECRET = "unit-test-secret-value";
const ACTOR = JSON.stringify({ clerkUserId: "u_1", email: "a@example.test" });

/** Every value that MUST be rejected. */
const REJECTED: { label: string; value: string | undefined }[] = [
  { label: "TEST (uppercase)", value: "TEST" },
  { label: "Test (title case)", value: "Test" },
  { label: "tEsT (mixed case)", value: "tEsT" },
  { label: "' test' (leading space)", value: " test" },
  { label: "'test ' (trailing space)", value: "test " },
  { label: "' test ' (both)", value: " test " },
  { label: "'test\\n' (newline)", value: "test\n" },
  { label: "'test\\t' (tab)", value: "test\t" },
  { label: "testing (prefix match)", value: "testing" },
  { label: "local", value: "local" },
  { label: "development", value: "development" },
  { label: "dev", value: "dev" },
  { label: "uat", value: "uat" },
  { label: "staging", value: "staging" },
  { label: "production", value: "production" },
  { label: "empty string", value: "" },
  { label: "missing (undefined)", value: undefined },
  { label: "null-like string", value: "null" },
  { label: "undefined-like string", value: "undefined" },
  { label: "misspelled (tets)", value: "tets" },
];

let originalAppEnv: string | undefined;
let originalEnabled: string | undefined;

beforeEach(() => {
  originalAppEnv = process.env.APP_ENV;
  originalEnabled = process.env.TEST_AUTH_ENABLED;
  // The adapter flag stays ON for every case so the ONLY variable under test is
  // APP_ENV — this proves APP_ENV alone is sufficient to fail closed.
  process.env.TEST_AUTH_ENABLED = "true";
});

afterEach(() => {
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
  if (originalEnabled === undefined) delete process.env.TEST_AUTH_ENABLED;
  else process.env.TEST_AUTH_ENABLED = originalEnabled;
});

function setAppEnv(value: string | undefined): void {
  if (value === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = value;
}

describe("FCX-P0-001: exact test-environment gate", () => {
  it("allows ONLY the exact lowercase value 'test'", () => {
    setAppEnv("test");
    expect(isExactTestEnvironment()).toBe(true);
    expect(testAuthEnabled()).toBe(true);
  });

  it.each(REJECTED)("rejects APP_ENV = $label", ({ value }) => {
    setAppEnv(value);

    // 1. the exact-environment helper says no
    expect(isExactTestEnvironment()).toBe(false);

    // 2. the adapter cannot be enabled, even with TEST_AUTH_ENABLED=true
    expect(testAuthEnabled()).toBe(false);

    // 3. a forged header with the CORRECT secret cannot authenticate anyone
    expect(parseTestActorHeader(SECRET, ACTOR, SECRET)).toBeNull();

    // 4. an admin-claiming forged header cannot authenticate either
    const adminActor = JSON.stringify({
      clerkUserId: "u_admin",
      email: "admin@example.test",
      role: "admin",
    });
    expect(parseTestActorHeader(SECRET, adminActor, SECRET)).toBeNull();

    // 5. in-process identity injection is refused
    expect(() =>
      setTestActor({
        clerkUserId: "u_1",
        email: "a@example.test",
        username: null,
        firstName: null,
        lastName: null,
      }),
    ).toThrow(/exactly 'test'/);
  });

  it("proves the specific regression: APP_ENV=TEST no longer enables test-auth", () => {
    setAppEnv("TEST");
    // The normalising helper still reports "test" — that is intentional and is
    // exactly why the security boundary must not use it.
    expect(appEnv()).toBe("test");
    // The security decision is unaffected by that normalisation.
    expect(isExactTestEnvironment()).toBe(false);
    expect(testAuthEnabled()).toBe(false);
    expect(parseTestActorHeader(SECRET, ACTOR, SECRET)).toBeNull();
  });

  it("still requires TEST_AUTH_ENABLED=true exactly, even under APP_ENV=test", () => {
    setAppEnv("test");
    for (const flag of [undefined, "", "false", "FALSE", "True", "TRUE", "0", "1", "yes"]) {
      if (flag === undefined) delete process.env.TEST_AUTH_ENABLED;
      else process.env.TEST_AUTH_ENABLED = flag;
      expect(testAuthEnabled(), `TEST_AUTH_ENABLED=${String(flag)}`).toBe(false);
    }
    process.env.TEST_AUTH_ENABLED = "true";
    expect(testAuthEnabled()).toBe(true);
  });

  it("still requires the exact server secret under APP_ENV=test", () => {
    setAppEnv("test");
    expect(parseTestActorHeader("wrong-secret", ACTOR, SECRET)).toBeNull();
    expect(parseTestActorHeader(null, ACTOR, SECRET)).toBeNull();
    expect(parseTestActorHeader(SECRET, ACTOR, undefined)).toBeNull();
    // correct secret + valid actor + exact env → resolves
    expect(parseTestActorHeader(SECRET, ACTOR, SECRET)).not.toBeNull();
  });

  it("never returns a role from the header (no self-elevation) under APP_ENV=test", () => {
    setAppEnv("test");
    const identity = parseTestActorHeader(
      SECRET,
      JSON.stringify({ clerkUserId: "u_1", email: "a@example.test", role: "admin" }),
      SECRET,
    );
    expect(identity).not.toBeNull();
    expect(identity as unknown as Record<string, unknown>).not.toHaveProperty("role");
  });
});

describe("FCX-P0-001: production-build regression", () => {
  it.each(["production", "TEST", undefined] as (string | undefined)[])(
    "test-auth cannot activate with APP_ENV=%s",
    (value) => {
      setAppEnv(value);
      expect(testAuthEnabled()).toBe(false);
      expect(parseTestActorHeader(SECRET, ACTOR, SECRET)).toBeNull();
    },
  );
});
