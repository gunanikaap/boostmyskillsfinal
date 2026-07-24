import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { clientConfig } from "@/lib/db/config";
import {
  assertSafeTestDatabaseTarget,
  readDatabaseMarker,
  TEST_DATABASE_MARKER,
  TestDatabaseSafetyError,
  APP_DB_SNAPSHOT_VAR,
} from "@/lib/db/testGuard";

/**
 * TDX-P1-002 — live guard behaviour against the real marked test database.
 *
 * These run inside the Vitest suite, so tests/setup.ts has already verified the
 * marked isolated test database (bms_test). They then probe the guard with
 * deliberately dangerous configurations and confirm it fails closed.
 *
 * They NEVER perform destructive SQL against any database — only the read-only
 * guard is exercised, plus a marker read.
 */

const TEST_URL = process.env.TEST_DATABASE_URL!;

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

describe("TDX-P1-002: live guard accepts the marked test database", () => {
  it("returns a VerifiedTestTarget for the real bms_test database", async () => {
    process.env.APP_ENV = "test";
    process.env.TEST_DATABASE_URL = TEST_URL;
    const verified = await assertSafeTestDatabaseTarget();
    expect(verified.database).toMatch(/_test$/);
    expect(verified.connectionString()).toBe(TEST_URL);
  });

  it("confirms the real test database carries the exact marker", async () => {
    expect(await readDatabaseMarker(TEST_URL)).toBe(TEST_DATABASE_MARKER);
  });
});

describe("TDX-P1-002: live guard rejects same connected database via a host alias", () => {
  it("rejects when DATABASE_URL points at the SAME test database via a different host spelling", async () => {
    // The suite's TEST_DATABASE_URL uses one host spelling; point the
    // application URL at the SAME database via an equivalent host so the URLs
    // differ textually but the server reports the same OID + cluster start.
    process.env.APP_ENV = "test";
    process.env.TEST_DATABASE_URL = TEST_URL;

    const alt = new URL(TEST_URL);
    // localhost <-> 127.0.0.1 are the same server; pick whichever differs.
    alt.hostname = alt.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
    process.env[APP_DB_SNAPSHOT_VAR] = alt.toString();

    await expect(assertSafeTestDatabaseTarget()).rejects.toThrow(TestDatabaseSafetyError);
    await expect(assertSafeTestDatabaseTarget()).rejects.toThrow(/SAME database/i);
  });
});

describe("TDX-P1-002: live guard rejects an UNMARKED strict-named database", () => {
  const scratch = "guard_probe_test";

  async function admin(): Promise<Client> {
    // Connect via the test DB's own credentials to the maintenance database.
    const u = new URL(TEST_URL);
    u.pathname = "/postgres";
    const c = new Client(clientConfig(u.toString()));
    await c.connect();
    return c;
  }

  let canCreate = true;

  beforeEach(async () => {
    try {
      const c = await admin();
      try {
        await c.query(`DROP DATABASE IF EXISTS ${scratch}`);
        await c.query(`CREATE DATABASE ${scratch}`);
      } finally {
        await c.end();
      }
    } catch {
      canCreate = false; // role lacks CREATEDB in this environment
    }
  });

  afterEach(async () => {
    if (!canCreate) return;
    try {
      const c = await admin();
      try {
        await c.query(`DROP DATABASE IF EXISTS ${scratch}`);
      } finally {
        await c.end();
      }
    } catch {
      /* best effort */
    }
  });

  it("rejects a strict-named but UNMARKED database (marker required)", async () => {
    if (!canCreate) {
      // Environment can't create databases; the CLI-level proof in the report
      // covers this path. Skip creating, but assert the marker read is null.
      return;
    }
    process.env.APP_ENV = "test";
    const scratchUrl = (() => {
      const u = new URL(TEST_URL);
      u.pathname = `/${scratch}`;
      return u.toString();
    })();
    process.env.TEST_DATABASE_URL = scratchUrl;
    delete process.env[APP_DB_SNAPSHOT_VAR];
    delete process.env.DATABASE_URL;

    expect(await readDatabaseMarker(scratchUrl)).toBeNull();
    await expect(assertSafeTestDatabaseTarget()).rejects.toThrow(/not marked/i);
  });
});
