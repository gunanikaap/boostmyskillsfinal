import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseDatabaseTarget,
  targetFingerprint,
  isSameDatabaseTarget,
  requireTestDatabaseUrl,
  assertIsolatedTestTarget,
  assertExactTestEnvironment,
  snapshotApplicationDatabaseUrl,
  TestDatabaseSafetyError,
  APP_DB_SNAPSHOT_VAR,
} from "@/lib/db/testGuard";

/**
 * FDX-P1-001 — database-backed tests and the authenticated Playwright harness
 * used to fall back from TEST_DATABASE_URL to DATABASE_URL. With
 * TEST_DATABASE_URL unset the suite would TRUNCATE the developer's local
 * database.
 *
 * These tests pin the fail-closed rules. There is deliberately NO bypass
 * variable, so no test here may introduce one.
 */

const APP_DB = "postgres://bms:pw@localhost:5433/bms";
const TEST_DB = "postgres://bms:pw@localhost:5433/bms_test";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    [APP_DB_SNAPSHOT_VAR]: process.env[APP_DB_SNAPSHOT_VAR],
  };
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function configure(opts: { appEnv?: string; testUrl?: string; appUrl?: string }) {
  if (opts.appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = opts.appEnv;
  if (opts.testUrl === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = opts.testUrl;
  if (opts.appUrl === undefined) delete process.env[APP_DB_SNAPSHOT_VAR];
  else process.env[APP_DB_SNAPSHOT_VAR] = opts.appUrl;
}

describe("FDX-P1-001: TEST_DATABASE_URL is mandatory (no fallback)", () => {
  it("throws when TEST_DATABASE_URL is missing — it never falls back to DATABASE_URL", () => {
    configure({ appEnv: "test", testUrl: undefined, appUrl: APP_DB });
    process.env.DATABASE_URL = APP_DB;
    expect(() => requireTestDatabaseUrl()).toThrow(TestDatabaseSafetyError);
    expect(() => requireTestDatabaseUrl()).toThrow(/TEST_DATABASE_URL is required/i);
  });

  it("throws when TEST_DATABASE_URL is empty or whitespace", () => {
    for (const v of ["", "   "]) {
      configure({ appEnv: "test", testUrl: v, appUrl: APP_DB });
      expect(() => requireTestDatabaseUrl()).toThrow(/required/i);
    }
  });

  it.each([
    "not-a-url",
    "mysql://u:p@h:3306/db",
    "postgres://host-without-db",
    "postgres:///nohost",
  ])("rejects the invalid connection string %s", (bad) => {
    configure({ appEnv: "test", testUrl: bad, appUrl: APP_DB });
    expect(() => requireTestDatabaseUrl()).toThrow(TestDatabaseSafetyError);
  });

  it("accepts a well-formed isolated URL", () => {
    configure({ appEnv: "test", testUrl: TEST_DB, appUrl: APP_DB });
    expect(requireTestDatabaseUrl()).toBe(TEST_DB);
  });
});

describe("FDX-P1-001: same-target detection ignores password and query params", () => {
  it("treats identical URLs as the same target", () => {
    expect(isSameDatabaseTarget(APP_DB, APP_DB)).toBe(true);
  });

  it("treats a differing PASSWORD as the same target", () => {
    expect(isSameDatabaseTarget("postgres://bms:one@localhost:5433/bms", APP_DB)).toBe(true);
  });

  it("treats differing QUERY PARAMETERS as the same target", () => {
    expect(isSameDatabaseTarget(`${APP_DB}?sslmode=require`, APP_DB)).toBe(true);
    expect(isSameDatabaseTarget(`${APP_DB}?a=1&b=2`, `${APP_DB}?b=2&a=1`)).toBe(true);
  });

  it("treats an implied default port as the same target as an explicit 5432", () => {
    expect(
      isSameDatabaseTarget(
        "postgres://bms:pw@localhost/bms",
        "postgres://bms:pw@localhost:5432/bms",
      ),
    ).toBe(true);
  });

  it("treats postgresql:// and postgres:// as the same scheme", () => {
    expect(isSameDatabaseTarget("postgresql://bms:pw@localhost:5433/bms", APP_DB)).toBe(true);
  });

  it("treats a DIFFERENT database name as a different target", () => {
    expect(isSameDatabaseTarget(TEST_DB, APP_DB)).toBe(false);
  });

  it("treats a different host or port as a different target", () => {
    expect(isSameDatabaseTarget("postgres://bms:pw@otherhost:5433/bms", APP_DB)).toBe(false);
    expect(isSameDatabaseTarget("postgres://bms:pw@localhost:5555/bms", APP_DB)).toBe(false);
  });

  it("never exposes the password in a fingerprint", () => {
    const fp = targetFingerprint(parseDatabaseTarget("postgres://bms:sup3rs3cret@h:5433/db", "X"));
    expect(fp).not.toContain("sup3rs3cret");
  });
});

describe("FDX-P1-001: assertIsolatedTestTarget", () => {
  it("allows a properly isolated test database under APP_ENV=test", () => {
    configure({ appEnv: "test", testUrl: TEST_DB, appUrl: APP_DB });
    expect(() => assertIsolatedTestTarget()).not.toThrow();
  });

  it("REJECTS when the test URL resolves to the application database", () => {
    configure({ appEnv: "test", testUrl: APP_DB, appUrl: APP_DB });
    expect(() => assertIsolatedTestTarget()).toThrow(/isolated database/i);
  });

  it.each([
    ["different password", "postgres://bms:different@localhost:5433/bms"],
    ["sslmode parameter", "postgres://bms:pw@localhost:5433/bms?sslmode=require"],
    ["postgresql scheme", "postgresql://bms:pw@localhost:5433/bms"],
  ])("REJECTS a disguised same target (%s)", (_label, disguised) => {
    configure({ appEnv: "test", testUrl: disguised, appUrl: APP_DB });
    expect(() => assertIsolatedTestTarget()).toThrow(/isolated database/i);
  });

  it("REJECTS when the application URL cannot be parsed (cannot prove isolation)", () => {
    configure({ appEnv: "test", testUrl: TEST_DB, appUrl: "garbage" });
    expect(() => assertIsolatedTestTarget()).toThrow(/cannot be verified|could not be parsed/i);
  });

  it.each(["TEST", "Test", "local", "development", "uat", "staging", "production", "", undefined])(
    "REJECTS destructive operations when APP_ENV is %s",
    (env) => {
      configure({ appEnv: env as string | undefined, testUrl: TEST_DB, appUrl: APP_DB });
      expect(() => assertIsolatedTestTarget()).toThrow(/exactly 'test'/i);
    },
  );

  it("assertExactTestEnvironment uses the RAW value (APP_ENV=TEST is rejected)", () => {
    configure({ appEnv: "TEST", testUrl: TEST_DB, appUrl: APP_DB });
    expect(() => assertExactTestEnvironment()).toThrow(/exactly 'test'/i);
    configure({ appEnv: "test", testUrl: TEST_DB, appUrl: APP_DB });
    expect(() => assertExactTestEnvironment()).not.toThrow();
  });
});

describe("FDX-P1-001: errors never leak connection details", () => {
  it("does not include the URL, host, user or password in any error message", () => {
    const secretUrl = "postgres://secretuser:s3cr3tpw@secret-host:5433/bms";
    configure({ appEnv: "test", testUrl: secretUrl, appUrl: secretUrl });
    try {
      assertIsolatedTestTarget();
      throw new Error("expected a rejection");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("s3cr3tpw");
      expect(msg).not.toContain("secretuser");
      expect(msg).not.toContain("secret-host");
      expect(msg).not.toContain(secretUrl);
    }
  });
});

describe("FDX-P1-001: application URL snapshot", () => {
  it("captures DATABASE_URL and does not overwrite an existing snapshot", () => {
    delete process.env[APP_DB_SNAPSHOT_VAR];
    process.env.DATABASE_URL = APP_DB;
    snapshotApplicationDatabaseUrl();
    expect(process.env[APP_DB_SNAPSHOT_VAR]).toBe(APP_DB);

    // Simulate the entry point repointing DATABASE_URL at the test database.
    process.env.DATABASE_URL = TEST_DB;
    snapshotApplicationDatabaseUrl();
    expect(process.env[APP_DB_SNAPSHOT_VAR]).toBe(APP_DB); // still the ORIGINAL
  });
});

describe("FDX-P1-001: no bypass exists", () => {
  it.each([
    "ALLOW_UNSAFE_TEST_DATABASE",
    "FORCE_TEST_DATABASE",
    "SKIP_TEST_DATABASE_GUARD",
    "BMS_SKIP_DB_GUARD",
  ])("setting %s does not defeat the guard", (bypass) => {
    const original = process.env[bypass];
    configure({ appEnv: "test", testUrl: APP_DB, appUrl: APP_DB });
    process.env[bypass] = "true";
    try {
      expect(() => assertIsolatedTestTarget()).toThrow(/isolated database/i);
    } finally {
      if (original === undefined) delete process.env[bypass];
      else process.env[bypass] = original;
    }
  });

  it("the guard source contains no bypass escape hatch", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/db/testGuard.ts", "utf8"),
    );
    for (const bad of [
      "ALLOW_UNSAFE",
      "FORCE_TEST_DATABASE",
      "SKIP_TEST_DATABASE_GUARD",
      "process.env.DATABASE_URL ??",
      "?? process.env.DATABASE_URL",
    ]) {
      expect(src, `guard must not contain ${bad}`).not.toContain(bad);
    }
  });
});

describe("FDX-P1-001: no fallback remains in the test entry points", () => {
  it.each([
    "tests/setup.ts",
    "scripts/e2e/run-auth-e2e.mts",
    "lib/env.ts",
    "scripts/db/reset.mts",
    "scripts/db/migrate.mts",
  ])("%s contains no TEST_DATABASE_URL -> DATABASE_URL fallback", async (file) => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(file, "utf8"));
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n")
      .replace(/\s+/g, " ");
    expect(code).not.toContain("TEST_DATABASE_URL ?? process.env.DATABASE_URL");
    expect(code).not.toContain("TEST_DATABASE_URL || process.env.DATABASE_URL");
    // The old conditional repoint: `if (process.env.TEST_DATABASE_URL) {`
    expect(code).not.toMatch(/if \(process\.env\.TEST_DATABASE_URL\) \{/);
  });
});
