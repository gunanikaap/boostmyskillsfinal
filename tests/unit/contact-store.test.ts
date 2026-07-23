import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSubmission, listSubmissions, CONTACT_LIST_LIMIT } from "@/lib/contact/store";

/**
 * /api/contact is public and unauthenticated, so this store can grow without
 * bound. The admin listing must stay bounded and newest-first.
 */
let root: string;
let originalRoot: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bms-contact-"));
  originalRoot = process.env.LOCAL_STORAGE_ROOT;
  process.env.LOCAL_STORAGE_ROOT = root;
});
afterEach(() => {
  if (originalRoot === undefined) delete process.env.LOCAL_STORAGE_ROOT;
  else process.env.LOCAL_STORAGE_ROOT = originalRoot;
  rmSync(root, { recursive: true, force: true });
});

async function submit(message: string) {
  return saveSubmission({
    firstName: "A",
    lastName: "B",
    email: "a@example.test",
    message,
  });
}

describe("contact submission store", () => {
  it("returns [] before any submission exists", async () => {
    expect(await listSubmissions()).toEqual([]);
  });

  it("persists a submission and reads it back", async () => {
    const saved = await submit("hello");
    const all = await listSubmissions();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(saved.id);
    expect(all[0]!.message).toBe("hello");
  });

  it("returns newest first", async () => {
    await submit("first");
    await new Promise((r) => setTimeout(r, 5));
    await submit("second");
    const all = await listSubmissions();
    expect(all).toHaveLength(2);
    expect(all[0]!.createdAt >= all[1]!.createdAt).toBe(true);
  });

  it("bounds the number of submissions read (public endpoint can be spammed)", async () => {
    for (let i = 0; i < 12; i++) {
      await submit(`m${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const limited = await listSubmissions(5);
    expect(limited).toHaveLength(5);
    // and the bounded slice is the NEWEST five, not an arbitrary five
    const all = await listSubmissions(100);
    expect(limited.map((s) => s.id)).toEqual(all.slice(0, 5).map((s) => s.id));
  });

  it("has a sane default limit", () => {
    expect(CONTACT_LIST_LIMIT).toBeGreaterThan(0);
    expect(CONTACT_LIST_LIMIT).toBeLessThanOrEqual(1000);
  });
});
