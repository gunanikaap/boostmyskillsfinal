import { gunzipSync } from "node:zlib";
import { OlxArchiveError } from "@/lib/olx/errors";

/**
 * Archive-safety inspection for OLX .tar.gz uploads. This is a hard security
 * boundary (admin-only imports). It gunzips with a bounded expanded-size budget
 * and parses the tar stream, rejecting every dangerous entry BEFORE any file is
 * written to disk.
 *
 * Protections: compressed-size limit, expanded-size limit, max file count, max
 * individual file size, path traversal (..), absolute paths, Windows drive
 * paths, symlinks, hardlinks, device/special files, invalid archives, duplicate
 * paths. GNU/PAX long-name extension headers are NOT honoured (their path
 * overrides are a smuggling vector); such entries are skipped safely.
 */

export interface ArchiveLimits {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxFileCount: number;
  maxFileBytes: number;
}

export const DEFAULT_LIMITS: ArchiveLimits = {
  maxCompressedBytes: 100 * 1024 * 1024, // 100 MB
  maxExpandedBytes: 500 * 1024 * 1024, // 500 MB
  maxFileCount: 20_000,
  maxFileBytes: 50 * 1024 * 1024, // 50 MB per file
};

export interface SafeEntry {
  path: string;
  size: number;
  content: Buffer;
}

function parseOctal(buf: Buffer): number {
  // Trim NULs/spaces; reject GNU base-256 (high bit set) numeric encoding.
  if (buf.length > 0 && (buf[0]! & 0x80) !== 0) {
    throw new OlxArchiveError("invalid_archive", "base-256 numeric fields are not supported");
  }
  const s = buf.toString("ascii").replace(/\0/g, "").trim();
  if (s === "") return 0;
  if (!/^[0-7]+$/.test(s)) {
    throw new OlxArchiveError("invalid_archive", "invalid numeric header field");
  }
  return parseInt(s, 8);
}

function isDangerousPath(name: string): OlxArchiveError | null {
  if (/^([a-zA-Z]:[\\/]|\\\\)/.test(name)) {
    return new OlxArchiveError("windows_drive_path", `Windows drive path rejected: ${name}`);
  }
  if (name.startsWith("/") || name.startsWith("\\")) {
    return new OlxArchiveError("absolute_path", `absolute path rejected: ${name}`);
  }
  const parts = name.split(/[\\/]/);
  if (parts.some((p) => p === "..")) {
    return new OlxArchiveError("path_traversal", `path traversal rejected: ${name}`);
  }
  return null;
}

export function inspectTarGz(gz: Buffer, limits: ArchiveLimits = DEFAULT_LIMITS): SafeEntry[] {
  if (gz.length > limits.maxCompressedBytes) {
    throw new OlxArchiveError("compressed_too_large", "compressed archive exceeds the size limit");
  }

  let tar: Buffer;
  try {
    tar = gunzipSync(gz, { maxOutputLength: limits.maxExpandedBytes });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/maxOutputLength|buffer/i.test(msg)) {
      throw new OlxArchiveError("expanded_too_large", "archive expands beyond the size limit");
    }
    throw new OlxArchiveError("invalid_archive", "not a valid gzip archive");
  }

  const entries: SafeEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let fileCount = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    // Two consecutive zero blocks mark the end.
    if (header.every((b) => b === 0)) break;

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = parseOctal(header.subarray(124, 136));
    const typeflag = String.fromCharCode(header[156]!);
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const name = prefix ? `${prefix}/${rawName}` : rawName;

    offset += 512;
    const dataBlocks = Math.ceil(size / 512) * 512;

    // Reject dangerous entry types outright.
    if (typeflag === "2") throw new OlxArchiveError("symlink", `symlink rejected: ${name}`);
    if (typeflag === "1") throw new OlxArchiveError("hardlink", `hardlink rejected: ${name}`);
    if (typeflag === "3" || typeflag === "4" || typeflag === "6") {
      throw new OlxArchiveError("special_file", `device/special file rejected: ${name}`);
    }

    // Skip GNU/PAX extension headers WITHOUT honouring their overrides.
    if (typeflag === "x" || typeflag === "g" || typeflag === "L" || typeflag === "K") {
      offset += dataBlocks;
      continue;
    }

    // Directories: validate the path but store nothing.
    if (typeflag === "5") {
      const bad = isDangerousPath(name);
      if (bad) throw bad;
      offset += dataBlocks;
      continue;
    }

    // Regular file ('0' or '\0').
    if (typeflag === "0" || typeflag === "\0" || header[156] === 0) {
      const bad = isDangerousPath(name);
      if (bad) throw bad;
      if (size > limits.maxFileBytes) {
        throw new OlxArchiveError("file_too_large", `file exceeds size limit: ${name}`);
      }
      fileCount += 1;
      if (fileCount > limits.maxFileCount) {
        throw new OlxArchiveError("too_many_files", "archive contains too many files");
      }
      const canonical = name.replace(/\\/g, "/");
      if (seen.has(canonical)) {
        throw new OlxArchiveError("duplicate_path", `duplicate path: ${canonical}`);
      }
      seen.add(canonical);

      if (offset + size > tar.length) {
        throw new OlxArchiveError("invalid_archive", "truncated archive (declared size overruns)");
      }
      const content = tar.subarray(offset, offset + size);
      entries.push({ path: canonical, size, content: Buffer.from(content) });
      offset += dataBlocks;
      continue;
    }

    // Unknown type — skip its data safely.
    offset += dataBlocks;
  }

  if (entries.length === 0) {
    throw new OlxArchiveError("invalid_archive", "no readable files in archive");
  }
  return entries;
}
