import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isStrictTestDatabaseName,
  isSameConnectedDatabase,
  TEST_DATABASE_MARKER,
  type ConnectedIdentity,
} from "@/lib/db/testGuard";

/**
 * TDX-P1-002 — URL comparison alone cannot prove isolation. Two independent
 * properties are required: a strict test-database NAME, and a persistent
 * database MARKER. Same-database detection is decided on the SERVER's reported
 * identity (cluster start time + database OID), so every host alias is caught.
 *
 * These tests exercise the pure logic (no live connection needed).
 */

describe("TDX-P1-002: strict test-database name rule", () => {
  it.each(["bms_test", "boostmyskills_test", "app_test", "ci_test"])(
    "accepts a dedicated '<name>_test' database (%s)",
    (name) => {
      expect(isStrictTestDatabaseName(name)).toBe(true);
    },
  );

  it.each([
    "bms",
    "boostmyskills",
    "boostmyskills_local",
    "postgres",
    "template0",
    "template1",
    "production",
    "uat",
    "staging",
    "live",
    "main",
    "test", // bare "test" is not a dedicated <name>_test database
    "_test", // empty prefix
    "",
    "   ",
    "testing", // does not end in _test
    "test_db", // "test" not in the required suffix position
    "my_test_database", // does not END with _test
    "production_test", // production-ish prefix is forbidden
    "prod_test",
    "uat_test",
    "staging_test",
    "BMS_TEST", // upper case not allowed
    "bms-test", // hyphen not allowed
  ])("rejects the unsafe database name %s", (name) => {
    expect(isStrictTestDatabaseName(name)).toBe(false);
  });

  it("rejects an over-length name", () => {
    expect(isStrictTestDatabaseName(`${"a".repeat(60)}_test`)).toBe(false);
  });
});

describe("TDX-P1-002: the marker constant", () => {
  it("is exactly the documented value", () => {
    expect(TEST_DATABASE_MARKER).toBe("boostmyskills:test-only:v1");
  });
});

function identity(over: Partial<ConnectedIdentity> = {}): ConnectedIdentity {
  return {
    database: "bms_test",
    databaseOid: "105030",
    postmasterStartTime: "2026-07-23 13:13:34.533355+00",
    serverAddr: "127.0.0.1/32",
    serverPort: "5432",
    marker: TEST_DATABASE_MARKER,
    ...over,
  };
}

describe("TDX-P1-002: connected-identity comparison catches aliases", () => {
  it("treats same cluster + same OID as the SAME database regardless of host spelling", () => {
    // localhost vs 127.0.0.1 vs ::1 — the server reports the same OID + start.
    const viaLocalhost = identity({ serverAddr: null }); // unix socket
    const via127 = identity({ serverAddr: "127.0.0.1/32" });
    const viaIpv6 = identity({ serverAddr: "::1/128" });
    expect(isSameConnectedDatabase(viaLocalhost, via127)).toBe(true);
    expect(isSameConnectedDatabase(via127, viaIpv6)).toBe(true);
    expect(isSameConnectedDatabase(viaLocalhost, viaIpv6)).toBe(true);
  });

  it("treats same cluster + same database NAME as the same database", () => {
    expect(isSameConnectedDatabase(identity(), identity({ databaseOid: "105030" }))).toBe(true);
  });

  it("does NOT use the username to decide isolation (same DB, different role)", () => {
    // ConnectedIdentity carries no username; two connections as different roles
    // to the same DB still compare equal.
    expect(isSameConnectedDatabase(identity(), identity())).toBe(true);
  });

  it("treats a DIFFERENT database on the SAME cluster as different", () => {
    const app = identity({ database: "bms", databaseOid: "16384" });
    const test = identity({ database: "bms_test", databaseOid: "105030" });
    expect(isSameConnectedDatabase(app, test)).toBe(false);
  });

  it("treats a DIFFERENT cluster (different postmaster start) as different", () => {
    const a = identity({ postmasterStartTime: "2026-07-23 13:13:34.5+00" });
    const b = identity({ postmasterStartTime: "2026-07-24 09:00:00.0+00" });
    expect(isSameConnectedDatabase(a, b)).toBe(false);
  });

  it("detects same DB even when inet_server_addr differs (IPv4 vs IPv6) via OID + start", () => {
    const ipv4 = identity({ serverAddr: "127.0.0.1/32" });
    const ipv6 = identity({ serverAddr: "::1/128" });
    // Different reported addr, but same cluster start + same OID → same database.
    expect(isSameConnectedDatabase(ipv4, ipv6)).toBe(true);
  });
});

describe("TDX-P1-002: source guarantees (no bypass, no auto-marking)", () => {
  const guardSrc = readFileSync(resolve(process.cwd(), "lib/db/testGuard.ts"), "utf8");
  const markSrc = readFileSync(resolve(process.cwd(), "scripts/db/mark-test-db.mts"), "utf8");

  // Strip line comments so we only inspect executable code, not documentation
  // prose that legitimately names the SQL statement.
  const codeOnly = (src: string) =>
    src
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");

  it("the guard never EXECUTES a COMMENT ON DATABASE (marker is set only by the tool)", () => {
    expect(codeOnly(guardSrc)).not.toMatch(/COMMENT ON DATABASE/i);
  });

  it("only the explicit provisioning tool writes the marker", () => {
    expect(codeOnly(markSrc)).toMatch(/COMMENT ON DATABASE/i);
  });

  it("no test/CLI entry point invokes the provisioning tool automatically", () => {
    for (const file of [
      "tests/setup.ts",
      "tests/helpers/db.ts",
      "scripts/e2e/run-auth-e2e.mts",
      "scripts/db/reset.mts",
      "scripts/db/migrate.mts",
      "scripts/verify.mts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src, `${file} must not invoke the marking tool`).not.toContain("mark-test-db");
      expect(codeOnly(src), `${file} must not write the marker`).not.toMatch(
        /COMMENT ON DATABASE/i,
      );
    }
  });

  it("the guard has no bypass escape hatch", () => {
    for (const bad of [
      "ALLOW_UNSAFE",
      "FORCE_TEST_DATABASE",
      "SKIP_TEST_DATABASE_GUARD",
      "SKIP_MARKER",
    ]) {
      expect(guardSrc).not.toContain(bad);
    }
  });
});
