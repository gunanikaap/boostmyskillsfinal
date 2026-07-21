import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Minimal ESM resolve hook so plain-node scripts (run with
 * --experimental-strip-types) can import the app's service layer, which uses the
 * "@/…" path alias and extensionless TypeScript imports (designed for the Next
 * bundler). Resolves "@/x" against the project root and fills in .ts/.tsx/index.
 * Everything else falls through to Node's default resolver.
 */
const ROOT = process.cwd();
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function firstExisting(base) {
  if (existsSync(base) && !existsSync(base + "/")) return base;
  for (const e of EXTS) if (existsSync(base + e)) return base + e;
  for (const e of EXTS) if (existsSync(join(base, "index" + e))) return join(base, "index" + e);
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = firstExisting(join(ROOT, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-z]+$/i.test(specifier)
  ) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : ROOT;
    const hit = firstExisting(join(parent, specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
