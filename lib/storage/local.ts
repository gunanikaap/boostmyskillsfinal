import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertValidKey } from "@/lib/storage/keys";
import { StorageError, type PutOptions, type StorageProvider } from "@/lib/storage/types";

/**
 * Local filesystem object storage. Behind the StorageProvider interface so it can
 * be swapped for a B2/S3 provider with no business-code change. Enforces root
 * containment, rejects traversal/absolute/drive/null-byte/symlink-escape, writes
 * atomically (temp file + rename), and never returns an absolute local path.
 */
export class LocalObjectStorage implements StorageProvider {
  readonly driver = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(process.cwd(), root);
  }

  /** Absolute on-disk path for a validated key, asserted to stay within root. */
  private resolve(key: string): string {
    assertValidKey(key); // throws on traversal/absolute/drive/null-byte
    const abs = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (abs !== this.root && !abs.startsWith(rootWithSep)) {
      throw new StorageError("traversal", "resolved path escapes storage root");
    }
    return abs;
  }

  /** Reject if the real (symlink-resolved) path escapes the storage root. */
  private async assertNoSymlinkEscape(abs: string): Promise<void> {
    let real: string;
    try {
      real = await fs.realpath(abs);
    } catch {
      return; // does not exist yet — nothing to escape
    }
    const rootReal = await fs.realpath(this.root);
    const rootWithSep = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
    if (real !== rootReal && !real.startsWith(rootWithSep)) {
      throw new StorageError("symlink_escape", "symlink target escapes storage root");
    }
  }

  async putObject(key: string, data: Buffer, opts: PutOptions): Promise<void> {
    if (opts.maxBytes !== undefined && data.length > opts.maxBytes) {
      throw new StorageError("too_large", "object exceeds the size limit");
    }
    const abs = this.resolve(key);
    await this.assertNoSymlinkEscape(path.dirname(abs));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // Atomic: write to a temp file in the same directory, then rename.
    const tmp = path.join(path.dirname(abs), `.tmp-${randomUUID()}`);
    try {
      await fs.writeFile(tmp, data, { flag: "wx" });
      await fs.rename(tmp, abs);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const abs = this.resolve(key);
    await this.assertNoSymlinkEscape(abs);
    try {
      return await fs.readFile(abs);
    } catch {
      throw new StorageError("not_found", "object not found");
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const abs = this.resolve(key);
    try {
      await fs.access(abs);
      await this.assertNoSymlinkEscape(abs);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const abs = this.resolve(key);
    await this.assertNoSymlinkEscape(abs);
    await fs.rm(abs, { force: true });
  }

  /** Controlled, provider-neutral public path — NEVER an absolute local path. */
  publicPath(key: string): string {
    assertValidKey(key);
    return `/media/${key}`;
  }
}
