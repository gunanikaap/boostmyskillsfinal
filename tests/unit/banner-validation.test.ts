import { describe, expect, it } from "vitest";
import { validateBanner } from "@/lib/storage/validateUpload";
import { StorageError } from "@/lib/storage/types";
import { BANNER_RULES } from "@/lib/content/defaults";
import { makePng, TINY_JPEG } from "@/tests/helpers/images";

describe("banner validation (structural, not just magic bytes)", () => {
  it("accepts a complete, decodable PNG and reports its dimensions", () => {
    const v = validateBanner(makePng(32, 18));
    expect(v.contentType).toBe("image/png");
    expect(v.width).toBe(32);
    expect(v.height).toBe(18);
  });

  it("accepts a complete, decodable JPEG", () => {
    const v = validateBanner(TINY_JPEG);
    expect(v.contentType).toBe("image/jpeg");
    expect(v.width).toBeGreaterThan(0);
    expect(v.height).toBeGreaterThan(0);
  });

  it("rejects a signature-only / truncated PNG (valid magic, no real image)", () => {
    const sigOnly = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(() => validateBanner(sigOnly)).toThrow(StorageError);
  });

  it("rejects a PNG whose IHDR declares zero dimensions", () => {
    const png = makePng(8, 8);
    png.writeUInt32BE(0, 16); // width = 0 (CRC now wrong too, but dims fail first)
    expect(() => validateBanner(png)).toThrow(StorageError);
  });

  it("rejects a MIME/signature mismatch (bytes are not an image at all)", () => {
    expect(() => validateBanner(Buffer.from("<html>not an image</html>"))).toThrow(StorageError);
  });

  it("rejects an oversized upload before decoding", () => {
    const tooBig = Buffer.alloc(BANNER_RULES.maxBytes + 1, 0);
    expect(() => validateBanner(tooBig)).toThrow(StorageError);
  });
});
