import { randomUUID } from "node:crypto";
import { StorageError } from "@/lib/storage/types";

/**
 * Server-generated, provider-neutral object keys. Keys are the ONLY storage
 * reference stored in the database/JSON. They never contain absolute paths,
 * drive letters, file:// URLs, localhost URLs or signed URLs.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_EXT = /^[A-Za-z0-9]{1,8}$/;

/** Validate a logical key: relative, forward-slash, safe segments only. */
export function assertValidKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) {
    throw new StorageError("invalid_key", "empty or oversized key");
  }
  if (key.includes("\0")) throw new StorageError("null_byte", "null byte in key");
  if (key.includes("\\")) throw new StorageError("windows_drive_path", "backslash in key");
  if (/^[a-zA-Z]:/.test(key)) throw new StorageError("windows_drive_path", "drive letter in key");
  if (key.startsWith("/")) throw new StorageError("absolute_path", "absolute key");
  const segments = key.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new StorageError("traversal", `unsafe segment in key: "${seg}"`);
    }
    if (!SAFE_SEGMENT.test(seg)) {
      throw new StorageError("invalid_key", `unsafe characters in key segment: "${seg}"`);
    }
  }
}

function ext(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename ?? "");
  const e = (m?.[1] ?? "bin").toLowerCase();
  return SAFE_EXT.test(e) ? e : "bin";
}

const PREFIX = () => (process.env.STORAGE_KEY_PREFIX ?? "").replace(/^\/+|\/+$/g, "");

function withPrefix(rest: string): string {
  const p = PREFIX();
  const key = p ? `${p}/${rest}` : rest;
  assertValidKey(key);
  return key;
}

/** Unique key for a credential banner. Duplicate original filenames never clash. */
export function credentialBannerKey(credentialId: string, originalFilename: string): string {
  return withPrefix(`credentials/${credentialId}/banners/${randomUUID()}.${ext(originalFilename)}`);
}

export function programmeBannerKey(programmeId: string, originalFilename: string): string {
  return withPrefix(`programmes/${programmeId}/banners/${randomUUID()}.${ext(originalFilename)}`);
}

export function olxArchiveKey(credentialId: string): string {
  return withPrefix(`olx/${credentialId}/${randomUUID()}.tar.gz`);
}

export function contentAssetKey(
  credentialId: string,
  revisionId: string,
  originalFilename: string,
): string {
  return withPrefix(
    `content/${credentialId}/${revisionId}/${randomUUID()}.${ext(originalFilename)}`,
  );
}
