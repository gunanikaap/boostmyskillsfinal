import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";
import { runMigrations } from "./migrate.mts";

/**
 * DEV/TEST ONLY: drop the public schema, re-create it, and re-run migrations.
 * Refuses to run when APP_ENV is uat or production.
 */
async function reset(connectionString: string): Promise<void> {
  const env = (process.env.APP_ENV ?? "local").toLowerCase();
  if (env === "uat" || env === "production") {
    throw new Error(`Refusing to reset database in APP_ENV=${env}`);
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    // pgcrypto lives in the extension catalogue; re-create if the role is allowed.
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {
      /* non-superuser: extension is pre-installed at the database level */
    });
  } finally {
    await client.end();
  }
  const applied = await runMigrations(connectionString);
  console.log(`Reset complete. Applied ${applied.length} migration(s).`);
}

loadEnv();
const useTest = process.argv.includes("--test");
const conn = useTest
  ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)
  : process.env.DATABASE_URL;
if (!conn) {
  console.error("No connection string.");
  process.exit(1);
}
reset(conn).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
