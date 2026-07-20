import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  createDraftFromPublished,
} from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getLearnerContent, submitMcqAttempt, recordUnitProgress } from "@/lib/player/service";
import { assertNoGradingLeak } from "@/lib/content/validate";
import { AccessError } from "@/lib/access/errors";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const UNIT = "u-mcq-1";

async function setupEnrolledLearner(correctOption = "oa") {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `C-${Math.round(Math.random() * 1e9)}`,
    slug: `c-${Math.round(Math.random() * 1e9)}`,
    title: "Quiz credential",
    authorName: "A",
    createdBy: admin,
  });
  const s = sampleContent(UNIT, "q1", "oa", "ob");
  s.grading.units[0]!.questions[0]!.correctOptionIds = [correctOption];
  await saveDraft({
    credentialId,
    content: s.content,
    grading: s.grading,
    certificationRule: s.certificationRule,
  });
  await publishCredential(credentialId);
  const learner = await makeUser("learner");
  await enrolInCredential(learner, credentialId);
  return { admin, credentialId, learner };
}

describe("grading secrecy", () => {
  it("never exposes grading in learner content", async () => {
    const { credentialId, learner } = await setupEnrolledLearner();
    const { content } = await getLearnerContent(learner, credentialId);
    expect(() => assertNoGradingLeak(content)).not.toThrow();
    expect(JSON.stringify(content)).not.toMatch(/correctOptionIds/);
  });
});

describe("scoring", () => {
  it("scores a correct answer as 100% pass and a wrong answer as fail", async () => {
    const a = await setupEnrolledLearner("oa");
    const right = await submitMcqAttempt({
      userId: a.learner,
      credentialId: a.credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    expect(right.result.percentage).toBe(100);
    expect(right.result.passed).toBe(true);

    const b = await setupEnrolledLearner("oa");
    const wrong = await submitMcqAttempt({
      userId: b.learner,
      credentialId: b.credentialId,
      unitId: UNIT,
      answers: { q1: ["ob"] },
    });
    expect(wrong.result.percentage).toBe(0);
    expect(wrong.result.passed).toBe(false);
  });
});

describe("one-attempt policy", () => {
  it("accepts one attempt and rejects a sequential second", async () => {
    const { credentialId, learner } = await setupEnrolledLearner();
    const first = await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    expect(first.attemptNumber).toBe(1);
    await expect(
      submitMcqAttempt({ userId: learner, credentialId, unitId: UNIT, answers: { q1: ["ob"] } }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    const count = await getPool().query(`SELECT count(*)::int c FROM assessment_attempts`);
    expect(count.rows[0]!.c).toBe(1);
  });

  it("is idempotent under a concurrent double-submit (no duplicate attempt)", async () => {
    const { credentialId, learner } = await setupEnrolledLearner();
    const results = await Promise.allSettled([
      submitMcqAttempt({ userId: learner, credentialId, unitId: UNIT, answers: { q1: ["oa"] } }),
      submitMcqAttempt({ userId: learner, credentialId, unitId: UNIT, answers: { q1: ["oa"] } }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    // both may fulfil (one real, one reused) OR one fulfils + one rejects; either
    // way there must be EXACTLY ONE attempt row.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const count = await getPool().query(`SELECT count(*)::int c FROM assessment_attempts`);
    expect(count.rows[0]!.c).toBe(1);
  });
});

describe("historical result immutability", () => {
  it("keeps the grading snapshot after a later draft changes the grading", async () => {
    const { admin, credentialId, learner } = await setupEnrolledLearner("oa");
    const attempt = await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    expect(attempt.result.passed).toBe(true);

    // Admin makes new draft changes flipping the correct answer, then publishes.
    await createDraftFromPublished(credentialId, admin);
    const s2 = sampleContent(UNIT, "q1", "oa", "ob");
    s2.grading.units[0]!.questions[0]!.correctOptionIds = ["ob"]; // flipped
    await saveDraft({
      credentialId,
      content: s2.content,
      grading: s2.grading,
      certificationRule: s2.certificationRule,
    });
    await publishCredential(credentialId);

    // The historical attempt's snapshot + result are unchanged.
    const row = await getPool().query(
      `SELECT grading_snapshot, passed, percentage FROM assessment_attempts LIMIT 1`,
    );
    const snap = row.rows[0]!.grading_snapshot as { questions: { correctOptionIds: string[] }[] };
    expect(snap.questions[0]!.correctOptionIds).toEqual(["oa"]); // original rule preserved
    expect(row.rows[0]!.passed).toBe(true);
    expect(Number(row.rows[0]!.percentage)).toBe(100);
  });
});

describe("progress writes validate the unit", () => {
  it("rejects progress for a unit not in the assigned version", async () => {
    const { credentialId, learner } = await setupEnrolledLearner();
    await expect(
      recordUnitProgress({
        userId: learner,
        credentialId,
        unitId: "ghost",
        status: "in_progress",
        progressPercent: 10,
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});
