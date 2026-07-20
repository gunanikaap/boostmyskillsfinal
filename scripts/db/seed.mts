import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";
import { clientConfig } from "../../lib/db/config.ts";

/**
 * Idempotent seed. Deliberately minimal: it guarantees the platform_settings
 * singleton exists (the migration already inserts it) and does NOT create any
 * synthetic users — admin promotion is a controlled server-side/migration action.
 */
async function seed(connectionString: string): Promise<void> {
  const client = new Client(clientConfig(connectionString));
  await client.connect();
  try {
    await client.query(
      `INSERT INTO platform_settings (id, maintenance_mode, updated_at)
       VALUES (1, false, now())
       ON CONFLICT (id) DO NOTHING`,
    );
    const { rows } = await client.query<{ id: number; maintenance_mode: boolean }>(
      `SELECT id, maintenance_mode FROM platform_settings WHERE id = 1`,
    );
    console.log("Seed complete. platform_settings:", rows[0]);
  } finally {
    await client.end();
  }
}

loadEnv();
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
seed(conn).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
