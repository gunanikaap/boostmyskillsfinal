import { execFileSync } from "node:child_process";

/**
 * Ensure the local demo catalogue exists before the public parity smokes run.
 * Idempotent — re-running never duplicates. Runs against the same local database
 * the dev server (webServer) uses.
 */
export default function globalSetup(): void {
  execFileSync("npm", ["run", "db:seed:ui"], { stdio: "inherit", shell: true });
}
