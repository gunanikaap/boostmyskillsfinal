import { readFileSync } from "node:fs";

/**
 * Single shared database connection/TLS configuration helper used by the
 * application pool, the migration runner, the seed runner and backup tooling.
 * Self-contained (reads process.env + node:fs only) so both the Next runtime
 * and plain-node scripts can import it.
 *
 * TLS behaviour:
 *  - Local (DATABASE_SSL=false): no TLS.
 *  - UAT/Production (DATABASE_SSL=true): rejectUnauthorized ALWAYS true; when
 *    DATABASE_SSL_CA_PATH is set the CA file is read and passed to pg; a missing/
 *    unreadable CA file fails clearly. There is NO fallback to rejectUnauthorized=false.
 * DATABASE_URL may point at an RDS Proxy endpoint with no code change.
 */

export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbConfigError";
  }
}

const POOL_MAX_MIN = 1;
const POOL_MAX_MAX = 20;
const POOL_MAX_DEFAULT = 5;

/** Validate DATABASE_POOL_MAX as an integer within [1, 20]; default 5. */
export function poolMax(): number {
  const raw = process.env.DATABASE_POOL_MAX;
  if (raw === undefined || raw.trim() === "") return POOL_MAX_DEFAULT;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new DbConfigError(`DATABASE_POOL_MAX must be an integer (got "${raw}")`);
  }
  const n = parseInt(raw.trim(), 10);
  if (n < POOL_MAX_MIN || n > POOL_MAX_MAX) {
    throw new DbConfigError(
      `DATABASE_POOL_MAX must be between ${POOL_MAX_MIN} and ${POOL_MAX_MAX} (got ${n})`,
    );
  }
  return n;
}

export type SslConfig = false | { rejectUnauthorized: true; ca?: string };

/** Build the pg `ssl` option. Never disables certificate verification. */
export function sslConfig(): SslConfig {
  const enabled = (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true";
  if (!enabled) return false;
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (caPath && caPath.trim() !== "") {
    let ca: string;
    try {
      ca = readFileSync(caPath, "utf8");
    } catch {
      throw new DbConfigError(
        `DATABASE_SSL_CA_PATH is set but the CA file could not be read: ${caPath}`,
      );
    }
    return { rejectUnauthorized: true, ca };
  }
  return { rejectUnauthorized: true };
}

/** Config for a single pg Client (migrations/seed/backup). */
export function clientConfig(connectionString: string) {
  return { connectionString, ssl: sslConfig() };
}

/** Config for the application pg Pool. */
export function poolConfig(connectionString: string) {
  return {
    connectionString,
    ssl: sslConfig(),
    max: poolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}
