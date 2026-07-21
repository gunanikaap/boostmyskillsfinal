import { BANNER_RULES } from "@/lib/content/defaults";
import { StorageError } from "@/lib/storage/types";
import { imageInfo, type ImageInfo } from "@/lib/storage/imageInfo";

/** Detect an image type by magic bytes; null if unrecognised. */
function sniffImage(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const EXT_FOR: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface ValidatedBanner {
  contentType: string;
  ext: string;
  width: number;
  height: number;
}

/**
 * Validate a banner upload against the centralised UAT rules: allowed MIME types,
 * matching magic-byte signature, and the size ceiling. The declared filename is
 * NOT trusted for the stored key (server generates the key); this only validates
 * the bytes and derives a safe extension from the signature.
 */
export function validateBanner(buf: Buffer): ValidatedBanner {
  if (buf.length > BANNER_RULES.maxBytes) {
    throw new StorageError("too_large", `banner exceeds ${BANNER_RULES.maxBytes} bytes`);
  }
  const sniffed = sniffImage(buf);
  if (!sniffed || !(BANNER_RULES.allowedMimeTypes as readonly string[]).includes(sniffed)) {
    throw new StorageError("unsupported_type", "banner must be a WebP, JPEG or PNG image");
  }
  // Beyond magic bytes: prove the image is real (parseable header, positive
  // dimensions), so a signature-only / truncated file is rejected.
  const info: ImageInfo = imageInfo(buf, sniffed);
  return { contentType: sniffed, ext: EXT_FOR[sniffed]!, width: info.width, height: info.height };
}
