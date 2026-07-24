import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/contact/route";
import { listSubmissions } from "@/lib/contact/store";

/**
 * FCX-P3-004 — the contact email is normalised (trim + lowercase) BEFORE
 * validation and persistence, using the same central normalizeEmail() as
 * identity sync, so only a normalised address is ever stored.
 */

let root: string;
let originalRoot: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bms-contact-route-"));
  originalRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.LOCAL_STORAGE_ROOT = root;
});
afterEach(() => {
  if (originalRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT;
  else process.env.LOCAL_STORAGE_ROOT = originalRoot;
  rmSync(root, { recursive: true, force: true });
});

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/contact", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as Promise<Response>;
}

const valid = {
  firstName: "Ada",
  lastName: "Lovelace",
  message: "Hello there.",
};

describe("FCX-P3-004: contact email normalisation", () => {
  it("stores a mixed-case email in lowercase", async () => {
    const res = await post({ ...valid, email: "Ada.Lovelace@Example.COM" });
    expect(res.status).toBe(201);
    const stored = await listSubmissions();
    expect(stored[0]!.email).toBe("ada.lovelace@example.com");
  });

  it("removes surrounding whitespace before storing", async () => {
    const res = await post({ ...valid, email: "   ada@example.com \t " });
    expect(res.status).toBe(201);
    const stored = await listSubmissions();
    expect(stored[0]!.email).toBe("ada@example.com");
  });

  it("normalises whitespace AND case together", async () => {
    const res = await post({ ...valid, email: "  ADA@Example.Com  " });
    expect(res.status).toBe(201);
    expect((await listSubmissions())[0]!.email).toBe("ada@example.com");
  });

  it("preserves an already-valid lowercase email unchanged", async () => {
    const res = await post({ ...valid, email: "ada@example.com" });
    expect(res.status).toBe(201);
    expect((await listSubmissions())[0]!.email).toBe("ada@example.com");
  });

  it("rejects a value that is invalid once normalised", async () => {
    for (const email of ["   ", "not-an-email", "  @example.com ", "ada@", "a b@example.com"]) {
      const res = await post({ ...valid, email });
      expect(res.status, `email=${JSON.stringify(email)}`).toBe(400);
    }
    expect(await listSubmissions()).toHaveLength(0);
  });

  it("rejects an over-length email (checked after normalisation)", async () => {
    const long = `${"a".repeat(250)}@example.com`;
    const res = await post({ ...valid, email: long });
    expect(res.status).toBe(400);
    expect(await listSubmissions()).toHaveLength(0);
  });

  it("rejects unexpected fields (strict schema, no mass assignment)", async () => {
    const res = await post({ ...valid, email: "ada@example.com", role: "admin" });
    expect(res.status).toBe(400);
    expect(await listSubmissions()).toHaveLength(0);
  });

  it("does not echo the stored submission back to the caller", async () => {
    const res = await post({ ...valid, email: "Ada@Example.com" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    // Only an acknowledgement — no id, email, message or timestamp echoed back.
    expect(body).toEqual({ ok: true });
    const text = JSON.stringify(body);
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain(valid.message);
  });

  it("rejects a malformed JSON body", async () => {
    const res = (await POST(
      new NextRequest("http://localhost/api/contact", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      }),
    )) as unknown as Response;
    expect(res.status).toBe(400);
  });
});
