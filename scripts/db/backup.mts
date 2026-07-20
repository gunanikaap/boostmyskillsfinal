import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../_loadEnv.mts";

/**
 * Create a compressed pg_dump backup of the local development database under the
 * git-ignored .data/backups directory. pg_dump runs inside the PostgreSQL
 * container (PG_CONTAINER, default bms-local-db) so no host pg client is needed.
 * In UAT/Production the same custom-format dump is produced by native pg_dump.
 *
 * Never prints credentials. Usage: npm run db:backup [-- <label>]
 */
loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const db = new URL(url).pathname.replace(/^\//, "") || "bms";
const user = new URL(url).username || "bms";
const container = process.env.PG_CONTAINER ?? "bms-local-db";
const stamp = process.argv[2] ?? `${Date.now()}`;

const dir = resolve(process.cwd(), ".data", "backups");
mkdirSync(dir, { recursive: true });
const outFile = resolve(dir, `${db}-${stamp}.dump`);

const res = spawnSync("docker", ["exec", container, "pg_dump", "-U", user, "-Fc", db], {
  maxBuffer: 512 * 1024 * 1024,
});
if (res.status !== 0) {
  console.error(`pg_dump failed (exit ${res.status}).`);
  if (res.stderr) console.error(res.stderr.toString().split("\n").slice(0, 3).join("\n"));
  process.exit(1);
}
writeFileSync(outFile, res.stdout);
console.log(`Backup written: ${outFile} (${res.stdout.length} bytes)`);
