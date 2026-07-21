import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Contact-message persistence.
 *
 * Contact submissions are NOT part of the frozen 11-table database schema, so we
 * deliberately keep them out of Postgres. Each submission is written as its own
 * JSON file under the app's local storage root (the same `.data/storage` area
 * used for uploads). Admins read them back with {@link listSubmissions}.
 *
 * One file per submission means concurrent writes never race on a shared index.
 */

export interface ContactSubmission {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  message: string;
  createdAt: string; // ISO-8601
}

export type NewContactSubmission = Omit<ContactSubmission, "id" | "createdAt">;

function contactDir(): string {
  const root = process.env.LOCAL_STORAGE_ROOT ?? ".data/storage";
  return path.resolve(process.cwd(), root, "contact");
}

/** Persist a submission. Returns the stored record (with id + timestamp). */
export async function saveSubmission(input: NewContactSubmission): Promise<ContactSubmission> {
  const record: ContactSubmission = {
    id: randomUUID(),
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    message: input.message,
    createdAt: new Date().toISOString(),
  };

  const dir = contactDir();
  await fs.mkdir(dir, { recursive: true });

  const body = JSON.stringify(record, null, 2);
  const finalPath = path.join(dir, `${record.createdAt.replace(/[:.]/g, "-")}_${record.id}.json`);
  const tmpPath = `${finalPath}.tmp`;
  // Atomic write: temp file then rename, so a reader never sees a partial file.
  await fs.writeFile(tmpPath, body, "utf8");
  await fs.rename(tmpPath, finalPath);

  return record;
}

/** All submissions, newest first. Returns [] before the first message arrives. */
export async function listSubmissions(): Promise<ContactSubmission[]> {
  const dir = contactDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const submissions: ContactSubmission[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      submissions.push(JSON.parse(raw) as ContactSubmission);
    } catch {
      // Skip an unreadable/partial file rather than failing the whole list.
    }
  }

  submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return submissions;
}
