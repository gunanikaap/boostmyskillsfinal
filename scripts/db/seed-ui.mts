/**
 * Idempotent LOCAL UI/demo catalogue seed for frontend review.
 *   npm run db:seed:ui
 * Loads .env.local, refuses uat/production, then seeds via lib/seed/uiDemo.
 */
import { loadEnv } from "./../_loadEnv.mts";

loadEnv();

const { seedUiDemo, DEMO } = await import("../../lib/seed/uiDemo.ts");
const { closePool } = await import("../../lib/db/pool.ts");

try {
  const s = await seedUiDemo();
  console.log("UI demo seed complete:");
  console.log(`  tag prefix:            ${DEMO}`);
  console.log(`  project id:            ${s.projectId}`);
  console.log(`  published credentials: ${s.publishedCredentials}`);
  console.log(`  published programmes:  ${s.publishedProgrammes}`);
  console.log(`  draft/hidden fixtures: seeded (not public)`);
} finally {
  await closePool();
}
