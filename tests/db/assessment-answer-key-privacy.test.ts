import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { submitMcqAttempt, getLearnerContent } from "@/lib/player/service";
import { getMcqReview, getEnrollmentUnitState } from "@/lib/learner/queries";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";
import { actAs } from "@/tests/helpers/auth";

/**
 * FCX-P1-002 — the MCQ answer key is server-only.
 *
 * lib/learner/queries.ts previously read assessment_attempts.grading_snapshot,
 * derived a correctByQuestion map, and handed it to learner-facing code, which
 * rendered correct answers client-side. The learner outcome only requires score,
 * pass mark, pass/fail and attempt status.
 *
 * These forbidden tokens must not appear in ANY learner-facing value.
 */
const FORBIDDEN = [
  "grading_snapshot",
  "gradingSnapshot",
  "grading_document",
  "gradingDocument",
  "correctByQuestion",
  "correctOptionIds",
];

const CORRECT_OPTION = "q1-correct";
const WRONG_OPTION = "q1-wrong";

/**
 * No answer-key structure may appear.
 *
 * Note: the correct option id may legitimately appear as the learner's OWN
 * choice when they answered correctly — that is their submitted answer, not the
 * key. The decisive leak check is the wrong-answer case below, where the correct
 * id must be absent entirely.
 */
function expectNoAnswerKey(value: unknown, label: string): void {
  const json = JSON.stringify(value ?? null);
  for (const token of FORBIDDEN) {
    expect(json, `${label} must not contain ${token}`).not.toContain(token);
  }
}

async function setup() {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const u = Math.random().toString(36).slice(2, 10);
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `MCQ-${u}`,
    slug: `mcq-${u}`,
    title: "Privacy Cred",
    authorName: "A",
    createdBy: admin,
  });
  await saveDraft({
    credentialId,
    content: {
      schemaVersion: 1,
      sections: [
        {
          id: "s1",
          sourceKey: null,
          title: "S",
          subsections: [
            {
              id: "sub1",
              sourceKey: null,
              title: "Sub",
              units: [
                {
                  id: "quiz1",
                  sourceKey: null,
                  type: "mcq",
                  title: "Quiz",
                  required: true,
                  data: {
                    passMark: 50,
                    questions: [
                      {
                        id: "q1",
                        text: "Pick one",
                        options: [
                          { id: WRONG_OPTION, text: "Wrong choice" },
                          { id: CORRECT_OPTION, text: "Right choice" },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    grading: {
      schemaVersion: 1,
      units: [
        {
          unitId: "quiz1",
          passMark: 50,
          maxAttempts: 1,
          questions: [{ questionId: "q1", correctOptionIds: [CORRECT_OPTION], points: 1 }],
        },
      ],
    },
    certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
  });
  await publishCredential(credentialId);
  const { userId: learner } = await actAs("learner");
  const { enrollmentId } = await enrolInCredential(learner, credentialId);
  return { credentialId, learner, enrollmentId };
}

beforeEach(resetDb);
afterAll(teardown);

describe("FCX-P1-002: learner MCQ payloads carry no answer key", () => {
  it("1. the initial learner content payload contains no answer key", async () => {
    const { credentialId, learner } = await setup();
    const { content } = await getLearnerContent(learner, credentialId);
    expectNoAnswerKey(content, "initial learner content");
  });

  it("2-3. the post-submission review contains no answer key (and none on reload)", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });

    const review = await getMcqReview(enrollmentId, "quiz1");
    expect(review).not.toBeNull();
    expectNoAnswerKey(review, "getMcqReview");

    // Reload path (a second read of the completed attempt) is equally clean.
    const reloaded = await getMcqReview(enrollmentId, "quiz1");
    expectNoAnswerKey(reloaded, "reloaded getMcqReview");
  });

  it("4. the learner still sees score, pass/fail and their own answers", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });
    const review = (await getMcqReview(enrollmentId, "quiz1"))!;

    expect(review.percentage).toBe(100);
    expect(review.passed).toBe(true);
    expect(review.attemptNumber).toBe(1);
    expect(review.score).toBe(1);
    expect(review.maximumScore).toBe(1);
    expect(typeof review.submittedAt).toBe("string");
    // the learner's OWN selections are still available for read-only display
    expect(review.chosenByQuestion.q1).toEqual([CORRECT_OPTION]);
  });

  it("5. a WRONG answer is still shown without revealing the correct option", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [WRONG_OPTION] },
    });
    const review = (await getMcqReview(enrollmentId, "quiz1"))!;

    expect(review.passed).toBe(false);
    expect(review.percentage).toBe(0);
    expect(review.chosenByQuestion.q1).toEqual([WRONG_OPTION]);
    expectNoAnswerKey(review, "wrong-answer review");

    // DECISIVE LEAK CHECK: the learner chose the wrong option, so the correct
    // option id must not appear anywhere in the learner-facing payload.
    expect(
      JSON.stringify(review),
      "a wrong answer must not reveal the correct option id",
    ).not.toContain(CORRECT_OPTION);
  });

  it("6. the DTO exposes only the allowlisted keys", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });
    const review = (await getMcqReview(enrollmentId, "quiz1"))!;
    expect(Object.keys(review).sort()).toEqual(
      [
        "attemptNumber",
        "chosenByQuestion",
        "maximumScore",
        "passed",
        "percentage",
        "score",
        "submittedAt",
      ].sort(),
    );
  });

  it("7. the unit-state payload (used by the player) contains no answer key", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });
    const state = await getEnrollmentUnitState(enrollmentId);
    expectNoAnswerKey(state, "enrollment unit state");
    void credentialId;
  });

  it("8. one-attempt state is preserved and the attempt row is unchanged in PostgreSQL", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });

    // A second submit must not create a second attempt.
    await expect(
      submitMcqAttempt({
        userId: learner,
        credentialId,
        unitId: "quiz1",
        answers: { q1: [WRONG_OPTION] },
      }),
    ).rejects.toThrow();

    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM assessment_attempts WHERE enrollment_id = $1`,
      [enrollmentId],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("9. grading_snapshot REMAINS stored server-side (immutable historical record)", async () => {
    const { credentialId, learner, enrollmentId } = await setup();
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "quiz1",
      answers: { q1: [CORRECT_OPTION] },
    });
    const { rows } = await getPool().query(
      `SELECT grading_snapshot FROM assessment_attempts WHERE enrollment_id = $1`,
      [enrollmentId],
    );
    const snapshot = JSON.stringify((rows[0] as { grading_snapshot: unknown }).grading_snapshot);
    // It is intentionally still there, and still holds the answer key server-side.
    expect(snapshot).toContain("correctOptionIds");
    expect(snapshot).toContain(CORRECT_OPTION);
  });

  it("10. the learner-facing SQL does not SELECT grading_snapshot", async () => {
    // Guards against a future re-introduction at the query layer. Comments may
    // mention the column (explaining why it is excluded); actual SQL must not
    // select it, and no correct-answer map may be derived.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/learner/queries.ts", "utf8"),
    );
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");
    expect(code).not.toContain("grading_snapshot");
    expect(code).not.toContain("correctByQuestion");
    expect(code).not.toContain("correctOptionIds");
  });
});
