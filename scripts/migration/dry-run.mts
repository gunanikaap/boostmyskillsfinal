import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../_loadEnv.mts";
import { upsertUsers } from "../../lib/migration/service.ts";

/**
 * Migration dry-run. Reads a source export at the path given by MIGRATION_SOURCE
 * (or ./migration-source/users.json). If the source is ABSENT, it reports
 * UNAVAILABLE and exits — it never fabricates counts or a "successful" migration.
 *
 * Usage: node --experimental-strip-types scripts/migration/dry-run.mts [--apply]
 */
loadEnv();
const apply = process.argv.includes("--apply");
const sourcePath = resolve(
  process.cwd(),
  process.env.MIGRATION_SOURCE ?? "migration-source/users.json",
);

if (!existsSync(sourcePath)) {
  console.log(
    JSON.stringify(
      { status: "UNAVAILABLE", reason: `No source export at ${sourcePath}`, blocked: true },
      null,
      2,
    ),
  );
  console.log("\nHistorical learner migration is EXTERNALLY BLOCKED until a real source export");
  console.log(
    "and the Clerk user-mapping strategy are provided. See docs/migration/migration-readiness.md.",
  );
  process.exit(0);
}

const records = JSON.parse(readFileSync(sourcePath, "utf8"));
const report = await upsertUsers(Array.isArray(records) ? records : [], { dryRun: !apply });
console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN", report }, null, 2));
