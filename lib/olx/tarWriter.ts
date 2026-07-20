import { gzipSync } from "node:zlib";

/** Minimal, safe tar.gz writer (ustar regular files only). */
export function writeTarGz(files: { path: string; content: string | Buffer }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const body = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, "utf8");
    const h = Buffer.alloc(512, 0);
    h.write(f.path.slice(0, 100), 0, "utf8");
    h.write("0000644\0", 100, "ascii");
    h.write("0000000\0", 108, "ascii");
    h.write("0000000\0", 116, "ascii");
    h.write(body.length.toString(8).padStart(11, "0") + "\0", 124, "ascii");
    h.write("00000000000\0", 136, "ascii");
    h.write("0", 156, "ascii"); // regular file
    h.write("ustar\0", 257, "ascii");
    h.write("00", 263, "ascii");
    h.write("        ", 148, "ascii");
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    blocks.push(h);
    const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512, 0);
    body.copy(padded);
    blocks.push(padded);
  }
  blocks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(blocks));
}
