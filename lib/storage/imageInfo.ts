import { StorageError } from "@/lib/storage/types";

/**
 * Structural image validation for uploads. Beyond magic bytes, this parses the
 * image header enough to prove it is a real, non-truncated image with positive
 * dimensions — so a file carrying only a valid signature (but no IHDR/SOF/real
 * pixels) is rejected. PNG and JPEG dimensions are parsed exactly; WebP is
 * structurally validated (RIFF length) with best-effort dimensions.
 */

export interface ImageInfo {
  width: number;
  height: number;
}

function fail(): never {
  throw new StorageError("invalid_image", "image is truncated or structurally invalid");
}

function pngInfo(buf: Buffer): ImageInfo {
  // 8-byte signature, then the first chunk MUST be IHDR: len(4)=13, "IHDR",
  // width(4), height(4), ... and the stream must end with an IEND chunk.
  if (buf.length < 33) fail();
  if (buf.readUInt32BE(8) !== 13 || buf.subarray(12, 16).toString("ascii") !== "IHDR") fail();
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width <= 0 || height <= 0) fail();
  if (!buf.subarray(-8).includes(Buffer.from("IEND", "ascii"))) fail();
  return { width, height };
}

function jpegInfo(buf: Buffer): ImageInfo {
  // Walk the marker segments looking for a Start-Of-Frame (SOFn) that carries the
  // real dimensions; require a final EOI (FFD9) so truncated files are rejected.
  if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) fail();
  let off = 2; // skip SOI (FFD8)
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) fail();
    const marker = buf[off + 1]!;
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) fail();
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry the frame size.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buf.readUInt16BE(off + 5);
      const width = buf.readUInt16BE(off + 7);
      if (width <= 0 || height <= 0) fail();
      return { width, height };
    }
    off += 2 + len;
  }
  return fail();
}

function webpInfo(buf: Buffer): ImageInfo {
  // RIFF container: bytes 4..8 hold the chunk size = fileLength - 8.
  if (buf.length < 30) fail();
  if (buf.readUInt32LE(4) !== buf.length - 8) fail();
  const fourcc = buf.subarray(12, 16).toString("ascii");
  if (fourcc === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff || 0;
    const height = buf.readUInt16LE(28) & 0x3fff || 0;
    if (width <= 0 || height <= 0) fail();
    return { width, height };
  }
  if (fourcc === "VP8L") {
    const b1 = buf[21]!;
    const b2 = buf[22]!;
    const b3 = buf[23]!;
    const b4 = buf[24]!;
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    if (width <= 0 || height <= 0) fail();
    return { width, height };
  }
  if (fourcc === "VP8X") {
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
    if (width <= 0 || height <= 0) fail();
    return { width, height };
  }
  return fail();
}

/** Parse + structurally validate an image of the given sniffed MIME type. */
export function imageInfo(buf: Buffer, mime: string): ImageInfo {
  if (mime === "image/png") return pngInfo(buf);
  if (mime === "image/jpeg") return jpegInfo(buf);
  if (mime === "image/webp") return webpInfo(buf);
  return fail();
}
