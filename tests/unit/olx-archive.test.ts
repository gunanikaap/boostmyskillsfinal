import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { inspectTarGz, DEFAULT_LIMITS } from "@/lib/olx/archiveSafety";
import { OlxArchiveError } from "@/lib/olx/errors";
import { buildTar } from "@/tests/helpers/tar";

describe("OLX archive safety", () => {
  it("accepts a valid archive and returns entries", () => {
    const gz = buildTar([
      { name: "course/course.xml", content: "<course/>" },
      { name: "course/about/overview.html", content: "<p>hi</p>" },
    ]);
    const entries = inspectTarGz(gz);
    expect(entries.map((e) => e.path)).toContain("course/course.xml");
    expect(entries).toHaveLength(2);
  });

  it("rejects path traversal", () => {
    const gz = buildTar([{ name: "course/../../etc/passwd", content: "x" }]);
    expect(() => inspectTarGz(gz)).toThrow(OlxArchiveError);
    try {
      inspectTarGz(gz);
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("path_traversal");
    }
  });

  it("rejects absolute paths", () => {
    const gz = buildTar([{ name: "/etc/passwd", content: "x" }]);
    expect(() => inspectTarGz(gz)).toThrow(/absolute/);
  });

  it("rejects Windows drive paths", () => {
    const gz = buildTar([{ name: "C:\\windows\\evil", content: "x" }]);
    try {
      inspectTarGz(gz);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("windows_drive_path");
    }
  });

  it("rejects symlinks", () => {
    const gz = buildTar([{ name: "course/link", typeflag: "2", linkname: "/etc/passwd" }]);
    try {
      inspectTarGz(gz);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("symlink");
    }
  });

  it("rejects hardlinks", () => {
    const gz = buildTar([{ name: "course/hl", typeflag: "1", linkname: "course/course.xml" }]);
    try {
      inspectTarGz(gz);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("hardlink");
    }
  });

  it("rejects device/special files", () => {
    const gz = buildTar([{ name: "course/dev", typeflag: "3" }]);
    try {
      inspectTarGz(gz);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("special_file");
    }
  });

  it("rejects a compressed-size bomb over the compressed limit", () => {
    const gz = buildTar([{ name: "course/x", content: "x" }]);
    expect(() => inspectTarGz(gz, { ...DEFAULT_LIMITS, maxCompressedBytes: 1 })).toThrow(
      /compressed/,
    );
  });

  it("rejects an expanded-size bomb over the expanded limit", () => {
    // ~1 MB of zeros compresses tiny but expands large.
    const big = "0".repeat(1024 * 1024);
    const gz = buildTar([{ name: "course/big", content: big }]);
    expect(() => inspectTarGz(gz, { ...DEFAULT_LIMITS, maxExpandedBytes: 1024 })).toThrow(
      /expands/,
    );
  });

  it("rejects an individual file over the per-file limit", () => {
    const gz = buildTar([{ name: "course/big", content: "0".repeat(2048) }]);
    expect(() => inspectTarGz(gz, { ...DEFAULT_LIMITS, maxFileBytes: 1024 })).toThrow(
      /file exceeds/,
    );
  });

  it("rejects duplicate paths", () => {
    const gz = buildTar([
      { name: "course/a", content: "1" },
      { name: "course/a", content: "2" },
    ]);
    try {
      inspectTarGz(gz);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as OlxArchiveError).code).toBe("duplicate_path");
    }
  });

  it("rejects a non-gzip / invalid archive", () => {
    expect(() => inspectTarGz(Buffer.from("not a gzip"))).toThrow(/valid gzip/);
  });

  it("rejects a truncated archive whose declared size overruns", () => {
    // declare a large size but provide no data blocks
    const gz = buildTar([{ name: "course/x", content: "", sizeOverride: 4096 }]);
    expect(() => inspectTarGz(gz)).toThrow(/truncated/);
  });

  it("does not honour GNU/PAX long-name override entries (skips them safely)", () => {
    const gz = buildTar([
      { name: "././@LongLink", typeflag: "L", content: "../../evil/path\n" },
      { name: "course/course.xml", content: "<course/>" },
    ]);
    // The 'L' entry is skipped; the real file is validated normally.
    const entries = inspectTarGz(gz);
    expect(entries.map((e) => e.path)).toEqual(["course/course.xml"]);
  });
});

// sanity: gzipSync is available (used by the helper)
void gzipSync;
