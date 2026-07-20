import { spawnSync } from "node:child_process";

/**
 * Single top-level verification pipeline (`npm run verify`).
 * Runs, in order: format check → lint → typecheck → tests (unit + DB) → production build.
 * Stops at the first failing step and reports a concise summary.
 *
 * The DB and build steps require external services (PostgreSQL). If those are
 * unavailable the step fails loudly rather than being silently skipped.
 */
const steps: { name: string; cmd: string; args: string[] }[] = [
  {
    name: "format:check",
    cmd: "npx",
    args: ["prettier", "--check", "{app,components,lib,scripts,tests}/**/*.{ts,tsx,mjs,mts,css}"],
  },
  { name: "lint", cmd: "npx", args: ["next", "lint"] },
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "test", cmd: "npx", args: ["vitest", "run", "--no-file-parallelism"] },
  { name: "build", cmd: "npx", args: ["next", "build"] },
];

const results: { name: string; ok: boolean }[] = [];
for (const step of steps) {
  console.log(`\n=== verify: ${step.name} ===`);
  const res = spawnSync(step.cmd, step.args, { stdio: "inherit", shell: true });
  const ok = res.status === 0;
  results.push({ name: step.name, ok });
  if (!ok) {
    console.error(`\nverify FAILED at step: ${step.name}`);
    break;
  }
}

console.log("\n================ verify summary ================");
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
const allOk = results.length === steps.length && results.every((r) => r.ok);
console.log(allOk ? "  ALL STEPS PASSED" : "  PIPELINE INCOMPLETE / FAILED");
process.exit(allOk ? 0 : 1);
