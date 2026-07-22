import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/pool";
import { importOlxToDraft } from "@/lib/olx/importer";
import { writeTarGz } from "@/lib/olx/tarWriter";
import { StorageError, type StorageProvider, type PutOptions } from "@/lib/storage/types";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

/** In-memory storage that records writes/deletes and can fail a chosen put. */
class RecordingStorage implements StorageProvider {
  readonly driver = "recording";
  puts: string[] = [];
  deletes: string[] = [];
  private putCount = 0;
  constructor(private failPut?: (key: string, n: number) => boolean) {}
  async putObject(key: string, _data: Buffer, _opts: PutOptions): Promise<void> {
    this.putCount += 1;
    if (this.failPut?.(key, this.putCount)) throw new Error("injected storage failure");
    this.puts.push(key);
  }
  async getObject(): Promise<Buffer> {
    throw new StorageError("not_found", "n/a");
  }
  async objectExists(key: string): Promise<boolean> {
    return this.puts.includes(key);
  }
  async deleteObject(key: string): Promise<void> {
    this.deletes.push(key);
  }
  publicPath(key: string): string {
    return `/media/${key}`;
  }
}

/** A standard-edX archive with TWO PDF readings (two /static PDFs). */
function twoPdfArchive() {
  return writeTarGz([
    { path: "course/course.xml", content: `<course url_name="run1" org="O" course="TWO"/>` },
    {
      path: "course/course/run1.xml",
      content: `<course display_name="Two"><chapter url_name="ch1"/></course>`,
    },
    {
      path: "course/chapter/ch1.xml",
      content: `<chapter display_name="C"><sequential url_name="sq1"/></chapter>`,
    },
    {
      path: "course/sequential/sq1.xml",
      content: `<sequential display_name="S"><vertical url_name="v1"/><vertical url_name="v2"/></sequential>`,
    },
    {
      path: "course/vertical/v1.xml",
      content: `<vertical display_name="R1"><html url_name="h1"/></vertical>`,
    },
    {
      path: "course/vertical/v2.xml",
      content: `<vertical display_name="R2"><html url_name="h2"/></vertical>`,
    },
    { path: "course/html/h1.xml", content: `<html filename="h1" display_name="Raw HTML"/>` },
    { path: "course/html/h2.xml", content: `<html filename="h2" display_name="Raw HTML"/>` },
    { path: "course/html/h1.html", content: `<p><iframe src="/static/doc1.pdf"></iframe></p>` },
    { path: "course/html/h2.html", content: `<p><iframe src="/static/doc2.pdf"></iframe></p>` },
    { path: "course/static/doc1.pdf", content: `%PDF-1.4 one` },
    { path: "course/static/doc2.pdf", content: `%PDF-1.4 two` },
  ]);
}

async function credentialCount(): Promise<number> {
  const { rows } = await getPool().query(`SELECT count(*)::int n FROM micro_credentials`);
  return rows[0]!.n;
}

describe("OLX import storage compensation (OLX-P2-003)", () => {
  it("cleans up the PDF objects and leaves no draft when the archive write fails", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const storage = new RecordingStorage((key) => key.endsWith(".tar.gz"));
    await expect(
      importOlxToDraft({
        gz: twoPdfArchive(),
        originalFilename: "c.tar.gz",
        projectId: project,
        adminId: admin,
        storage,
      }),
    ).rejects.toThrow();
    // Both PDF objects were written, then deleted; the archive was never written.
    expect(storage.puts.filter((k) => k.endsWith(".pdf"))).toHaveLength(2);
    expect(storage.deletes.sort()).toEqual(storage.puts.filter((k) => k.endsWith(".pdf")).sort());
    expect(storage.deletes.some((k) => k.endsWith(".tar.gz"))).toBe(false);
    // DB rolled back — no partial credential/draft.
    expect(await credentialCount()).toBe(0);
  });

  it("cleans up prior objects when a later PDF write fails (partial cleanup)", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const storage = new RecordingStorage((key, n) => key.endsWith(".pdf") && n === 2);
    await expect(
      importOlxToDraft({
        gz: twoPdfArchive(),
        originalFilename: "c.tar.gz",
        projectId: project,
        adminId: admin,
        storage,
      }),
    ).rejects.toThrow();
    // The first PDF was written then cleaned; nothing else committed.
    expect(storage.deletes).toHaveLength(1);
    expect(storage.deletes[0]!.endsWith(".pdf")).toBe(true);
    expect(await credentialCount()).toBe(0);
  });

  it("never deletes a caller-supplied (non-owned) archive key", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const callerKey = "external/caller-owned.tar.gz";
    const storage = new RecordingStorage((key) => key === callerKey);
    await expect(
      importOlxToDraft({
        gz: twoPdfArchive(),
        originalFilename: "c.tar.gz",
        projectId: project,
        adminId: admin,
        archiveObjectKey: callerKey,
        storage,
      }),
    ).rejects.toThrow();
    // PDFs owned by this op are cleaned; the caller-owned key is never deleted.
    expect(storage.deletes.every((k) => k.endsWith(".pdf"))).toBe(true);
    expect(storage.deletes).not.toContain(callerKey);
    expect(await credentialCount()).toBe(0);
  });

  it("keeps all objects and the draft on a successful import", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const storage = new RecordingStorage(); // never fails
    const res = await importOlxToDraft({
      gz: twoPdfArchive(),
      originalFilename: "c.tar.gz",
      projectId: project,
      adminId: admin,
      storage,
    });
    expect(storage.deletes).toHaveLength(0);
    expect(storage.puts.filter((k) => k.endsWith(".pdf"))).toHaveLength(2);
    expect(storage.puts.some((k) => k.endsWith(".tar.gz"))).toBe(true);
    const ver = await getPool().query(
      `SELECT status FROM credential_versions WHERE credential_id = $1`,
      [res.credentialId],
    );
    expect(ver.rows[0]!.status).toBe("draft");
  });
});

// Silence the intentional operational rollback warning in test output.
vi.spyOn(console, "warn").mockImplementation(() => {});
