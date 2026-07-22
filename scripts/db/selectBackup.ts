import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { resolve, basename, sep } from "node:path";

/** Name of the pointer file db:backup writes with the exact created dump path. */
export const HANDOFF = ".last-backup";

function isUsableFile(abs: string): boolean {
  try {
    const s = statSync(abs);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function assertUsable(abs: string): void {
  let s;
  try {
    s = statSync(abs);
  } catch {
    throw new Error(`Backup file not found or unreadable: ${abs}`);
  }
  if (!s.isFile()) throw new Error(`Backup path is not a file: ${abs}`);
  if (s.size === 0) throw new Error(`Backup file is empty: ${abs}`);
}

function isInside(dir: string, abs: string): boolean {
  const d = resolve(dir);
  return abs === d || abs.startsWith(d + sep) || abs.startsWith(d + "/");
}

/**
 * Choose the backup `.dump` to restore-verify, in priority order:
 *   1. an explicit path (any location — the operator chose it);
 *   2. the db:backup handoff pointer, if it names a usable file INSIDE `dir`;
 *   3. the newest valid `.dump` by file MODIFICATION TIME (not filename order),
 *      ties broken deterministically by descending name.
 * Directories and non-`.dump` files are ignored. Throws clearly when nothing
 * usable is found, the file is empty/unreadable, or (implicit mode) the pointer
 * escapes the backup directory.
 */
export function selectBackupFile(dir: string, explicit?: string): string {
  if (explicit) {
    const abs = resolve(explicit);
    assertUsable(abs);
    return abs;
  }

  const handoffPath = resolve(dir, HANDOFF);
  if (existsSync(handoffPath)) {
    const pointed = readFileSync(handoffPath, "utf8").trim();
    if (pointed) {
      const abs = resolve(pointed);
      if (isInside(dir, abs) && isUsableFile(abs)) return abs;
    }
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`No backup directory: ${dir}. Run \`npm run db:backup\` first.`);
  }
  const candidates = entries
    .filter((f) => f.endsWith(".dump"))
    .map((f) => resolve(dir, f))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
  if (candidates.length === 0) {
    throw new Error("No backup .dump found. Run `npm run db:backup` first.");
  }
  candidates.sort((a, b) => {
    const d = statSync(b).mtimeMs - statSync(a).mtimeMs;
    return d !== 0 ? d : basename(b).localeCompare(basename(a));
  });
  const chosen = candidates[0]!;
  assertUsable(chosen);
  return chosen;
}
