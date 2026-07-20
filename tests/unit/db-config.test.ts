import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { poolMax, sslConfig, clientConfig, poolConfig, DbConfigError } from "@/lib/db/config";

const KEYS = ["DATABASE_SSL", "DATABASE_POOL_MAX", "DATABASE_SSL_CA_PATH"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("pool size validation", () => {
  it("defaults to 5 when unset", () => {
    expect(poolMax()).toBe(5);
  });
  it("uses a configured valid value", () => {
    process.env.DATABASE_POOL_MAX = "10";
    expect(poolMax()).toBe(10);
    expect(poolConfig("postgres://x").max).toBe(10);
  });
  it("rejects zero / negative", () => {
    process.env.DATABASE_POOL_MAX = "0";
    expect(() => poolMax()).toThrow(DbConfigError);
    process.env.DATABASE_POOL_MAX = "-3";
    expect(() => poolMax()).toThrow(DbConfigError);
  });
  it("rejects an excessive value", () => {
    process.env.DATABASE_POOL_MAX = "50";
    expect(() => poolMax()).toThrow(/between 1 and 20/);
  });
  it("rejects a non-integer", () => {
    process.env.DATABASE_POOL_MAX = "abc";
    expect(() => poolMax()).toThrow(DbConfigError);
  });
});

describe("SSL / TLS config", () => {
  it("is disabled locally (DATABASE_SSL=false)", () => {
    process.env.DATABASE_SSL = "false";
    expect(sslConfig()).toBe(false);
    expect(clientConfig("postgres://x").ssl).toBe(false);
  });
  it("enables with default trust when SSL on and no CA path", () => {
    process.env.DATABASE_SSL = "true";
    expect(sslConfig()).toEqual({ rejectUnauthorized: true });
  });
  it("loads a configured CA file (never disables verification)", async () => {
    const caPath = path.join(os.tmpdir(), `ca-${randomUUID()}.pem`);
    await fs.writeFile(caPath, "-----BEGIN CERTIFICATE-----\nFIXTURE\n-----END CERTIFICATE-----\n");
    process.env.DATABASE_SSL = "true";
    process.env.DATABASE_SSL_CA_PATH = caPath;
    const ssl = sslConfig();
    expect(ssl).toMatchObject({ rejectUnauthorized: true });
    expect((ssl as { ca: string }).ca).toContain("FIXTURE");
    await fs.rm(caPath, { force: true });
  });
  it("fails clearly on an invalid CA path (no fallback to insecure)", () => {
    process.env.DATABASE_SSL = "true";
    process.env.DATABASE_SSL_CA_PATH = path.join(os.tmpdir(), `missing-${randomUUID()}.pem`);
    expect(() => sslConfig()).toThrow(DbConfigError);
  });
});

describe("no connection details are logged", () => {
  it("clientConfig/poolConfig do not print the connection string", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    clientConfig("postgres://secret:pw@host/db");
    poolConfig("postgres://secret:pw@host/db");
    expect(spy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    errSpy.mockRestore();
  });
});
