import { Client } from "pg";
import { loadEnv } from "../_loadEnv.mts";

/**
 * Controlled server-side admin promotion. Usage:
 *   node --experimental-strip-types scripts/admin/promote.mts <email>
 *
 * The only supported way (besides a migration) to grant the admin role. The
 * browser can never assign or elevate its own role. This script:
 *  - normalizes the email (trim + lowercase);
 *  - uses a parameterized query;
 *  - refuses (exit 2) when no matching user exists;
 *  - updates exactly one user and reports only the redacted email + new role.
 */
loadEnv();
const rawEmail = process.argv[2];
if (!rawEmail) {
  console.error("Usage: promote.mts <email>");
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

function redact(e: string): string {
  const [local, domain] = e.split("@");
  const head = (local ?? "").slice(0, 2);
  return `${head}***@${domain ?? ""}`;
}

const client = new Client({ connectionString: conn });
await client.connect();
try {
  const res = await client.query<{ role: string }>(
    `UPDATE app_users SET role='admin' WHERE lower(email)=$1 RETURNING role`,
    [email],
  );
  if ((res.rowCount ?? 0) === 0) {
    console.error(`No app_user with email ${redact(email)}. They must sign in once first.`);
    process.exit(2);
  }
  console.log(`Promoted ${redact(email)} → role=${res.rows[0]!.role}`);
} finally {
  await client.end();
}
