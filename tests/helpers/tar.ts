import { gzipSync } from "node:zlib";

export interface TarEntryInput {
  name: string;
  content?: string;
  typeflag?: string; // '0' file, '2' symlink, '1' hardlink, '5' dir, '3' char device
  linkname?: string;
  sizeOverride?: number; // to fake a declared size (size bombs / truncation)
}

function octal(n: number, len: number): Buffer {
  const s = n.toString(8).padStart(len - 1, "0") + "\0";
  return Buffer.from(s, "ascii");
}

function header(entry: TarEntryInput, size: number): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(entry.name.slice(0, 100), 0, "utf8");
  octal(0o644, 8).copy(h, 100); // mode
  octal(0, 8).copy(h, 108); // uid
  octal(0, 8).copy(h, 116); // gid
  octal(size, 12).copy(h, 124); // size
  octal(0, 12).copy(h, 136); // mtime
  h.write(entry.typeflag ?? "0", 156, "ascii"); // typeflag
  if (entry.linkname) h.write(entry.linkname.slice(0, 100), 157, "utf8");
  h.write("ustar\0", 257, "ascii"); // magic
  h.write("00", 263, "ascii"); // version
  // checksum: treat chksum field as spaces
  h.write("        ", 148, "ascii");
  let sum = 0;
  for (const b of h) sum += b;
  const chk = sum.toString(8).padStart(6, "0") + "\0 ";
  h.write(chk, 148, "ascii");
  return h;
}

/** Build a (optionally gzipped) tar buffer from entries. */
export function buildTar(entries: TarEntryInput[], gzip = true): Buffer {
  const blocks: Buffer[] = [];
  for (const e of entries) {
    const body = Buffer.from(e.content ?? "", "utf8");
    const declaredSize = e.sizeOverride ?? (e.typeflag === "5" ? 0 : body.length);
    blocks.push(header(e, declaredSize));
    if (e.typeflag !== "5" && e.typeflag !== "2" && e.typeflag !== "1") {
      const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512, 0);
      body.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024, 0)); // two zero blocks
  const tar = Buffer.concat(blocks);
  return gzip ? gzipSync(tar) : tar;
}
