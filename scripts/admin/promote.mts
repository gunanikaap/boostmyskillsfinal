import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";

/**
 * Controlled server-side admin promotion. Usage:
 *   node --experimental-strip-types scripts/admin/promote.mts <email>
 * This is the only supported way to grant the admin role (besides a migration).
 * The browser can never assign or elevate its own role.
 */
loadEnv();
const email = process.argv[2];
if (!email) {
  console.error("Usage: promote.mts <email>");
  process.exit(1);
}
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: conn });
await client.connect();
try {
  const res = await client.query(
    `UPDATE app_users SET role='admin' WHERE email=$1 RETURNING id, email, role`,
    [email],
  );
  if (res.rowCount === 0) {
    console.error(`No app_user with email ${email}. They must sign in once first.`);
    process.exit(2);
  }
  console.log("Promoted:", res.rows[0]);
} finally {
  await client.end();
}
