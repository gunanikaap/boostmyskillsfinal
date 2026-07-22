import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { selectBackupFile, HANDOFF } from "@/scripts/db/selectBackup";

let dir: string;

function makeDump(name: string, ageSeconds: number, size = 10): string {
  const p = join(dir, name);
  writeFileSync(p, Buffer.alloc(size, 1));
  const when = new Date(Date.now() - ageSeconds * 1000);
  utimesSync(p, when, when);
  return p;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bms-backups-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("selectBackupFile (OPS-P2-004)", () => {
  it("picks the newest by mtime even when the filename order disagrees", () => {
    // 'zzz' sorts last lexically but is OLDER; 'aaa' is newest by mtime.
    makeDump("zzz.dump", 3600);
    const newest = makeDump("aaa.dump", 1);
    expect(selectBackupFile(dir)).toBe(resolve(newest));
  });

  it("prefers the handoff pointer when it names a usable file inside the dir", () => {
    makeDump("aaa.dump", 1); // newer by mtime
    const target = makeDump("bms-vuat.dump", 3600); // older, but pointed to
    writeFileSync(join(dir, HANDOFF), target, "utf8");
    expect(selectBackupFile(dir)).toBe(resolve(target));
  });

  it("ignores a handoff pointer that escapes the backup dir, falling back to mtime", () => {
    const newest = makeDump("aaa.dump", 1);
    writeFileSync(join(dir, HANDOFF), "/etc/passwd", "utf8");
    expect(selectBackupFile(dir)).toBe(resolve(newest));
  });

  it("uses an explicit path anywhere and validates it", () => {
    const other = mkdtempSync(join(tmpdir(), "bms-elsewhere-"));
    const p = join(other, "explicit.dump");
    writeFileSync(p, Buffer.alloc(5, 1));
    try {
      expect(selectBackupFile(dir, p)).toBe(resolve(p));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("throws clearly when the newest dump is empty", () => {
    makeDump("old.dump", 3600, 10);
    makeDump("new.dump", 1, 0); // newest but empty
    expect(() => selectBackupFile(dir)).toThrow(/empty/i);
  });

  it("throws when no dump exists and when an explicit file is missing", () => {
    expect(() => selectBackupFile(dir)).toThrow(/No backup \.dump/);
    expect(() => selectBackupFile(dir, join(dir, "missing.dump"))).toThrow(/not found|unreadable/i);
  });

  it("ignores non-dump files and directories", () => {
    makeDump("real.dump", 10);
    writeFileSync(join(dir, "notes.txt"), "x");
    expect(selectBackupFile(dir)).toBe(resolve(join(dir, "real.dump")));
  });
});
