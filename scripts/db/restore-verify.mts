import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../_loadEnv.mts";

/**
 * Restore the latest (or a given) backup into a SEPARATE temporary verification
 * database, verify tables + migration state, compare key row counts against the
 * source, and drop the verification database (unless --keep). Refuses uat/prod.
 *
 * Never prints credentials. Usage: npm run db:restore:verify [-- <dumpFile>] [--keep]
 */
loadEnv();
const env = (process.env.APP_ENV ?? "local").toLowerCase();
if (env === "uat" || env === "production") {
  console.error(`Refusing to run restore verification in APP_ENV=${env}`);
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const sourceDb = new URL(url).pathname.replace(/^\//, "") || "bms";
const user = new URL(url).username || "bms";
const superuser = process.env.PG_SUPERUSER ?? "boostmyskills";
const container = process.env.PG_CONTAINER ?? "bms-local-db";
const keep = process.argv.includes("--keep");

const dir = resolve(process.cwd(), ".data", "backups");
let dumpFile = process.argv.find((a) => a.endsWith(".dump"));
if (!dumpFile) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".dump"))
    .sort();
  if (files.length === 0) {
    console.error("No backup .dump found. Run `npm run db:backup` first.");
    process.exit(1);
  }
  dumpFile = resolve(dir, files[files.length - 1]!);
}

const verifyDb = `${sourceDb}_verify_${Date.now()}`;
function psql(dbName: string, sql: string) {
  return spawnSync(
    "docker",
    ["exec", container, "psql", "-U", superuser, "-d", dbName, "-tAc", sql],
    {
      encoding: "utf8",
    },
  );
}
function count(dbName: string, table: string): number {
  const r = psql(dbName, `SELECT count(*) FROM ${table};`);
  return parseInt((r.stdout ?? "0").trim() || "0", 10);
}

const discrepancies: string[] = [];
try {
  console.log(`Restoring ${dumpFile} into temporary DB ${verifyDb} ...`);
  const create = psql("postgres", `CREATE DATABASE ${verifyDb} OWNER ${user};`);
  if (create.status !== 0) throw new Error(`createdb failed: ${create.stderr}`);
  psql(verifyDb, "CREATE EXTENSION IF NOT EXISTS pgcrypto;");

  const dump = readFileSync(dumpFile);
  const restore = spawnSync(
    "docker",
    ["exec", "-i", container, "pg_restore", "-U", superuser, "-d", verifyDb, "--no-owner"],
    { input: dump, maxBuffer: 512 * 1024 * 1024, encoding: "utf8" },
  );
  // pg_restore may exit non-zero on benign warnings; we validate by inspection below.

  // 1. expected tables present
  const expectTables = [
    "app_users",
    "projects",
    "micro_credentials",
    "credential_versions",
    "micro_programmes",
    "programme_credentials",
    "enrollments",
    "unit_progress",
    "assessment_attempts",
    "certificates",
    "platform_settings",
    "schema_migrations",
  ];
  const tablesRes = psql(
    verifyDb,
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;",
  );
  const restoredTables = (tablesRes.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of expectTables) {
    if (!restoredTables.includes(t)) discrepancies.push(`missing table after restore: ${t}`);
  }

  // 2. migration state matches
  const srcMig = count(sourceDb, "schema_migrations");
  const dstMig = count(verifyDb, "schema_migrations");
  if (srcMig !== dstMig)
    discrepancies.push(`schema_migrations count mismatch: source=${srcMig} restored=${dstMig}`);

  // 3. key row counts match
  for (const t of ["app_users", "projects", "micro_credentials", "enrollments", "certificates"]) {
    const s = count(sourceDb, t);
    const d = count(verifyDb, t);
    if (s !== d) discrepancies.push(`row-count mismatch ${t}: source=${s} restored=${d}`);
  }

  if (discrepancies.length === 0) {
    console.log(
      `OK: ${restoredTables.length} tables restored; migrations=${dstMig}; key row counts match.`,
    );
  } else {
    console.error("DISCREPANCIES:");
    for (const d of discrepancies) console.error("  - " + d);
  }
  void restore;
} finally {
  if (!keep) {
    psql(
      "postgres",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${verifyDb}';`,
    );
    psql("postgres", `DROP DATABASE IF EXISTS ${verifyDb};`);
    console.log(`Dropped temporary DB ${verifyDb}.`);
  } else {
    console.log(`Kept temporary DB ${verifyDb} (--keep).`);
  }
}
process.exit(discrepancies.length === 0 ? 0 : 2);
