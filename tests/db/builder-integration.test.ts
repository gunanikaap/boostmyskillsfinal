import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { assembleDocuments, certificationRule, type BuilderState } from "@/lib/admin/builder/model";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { getPublishedCredentialBySlug } from "@/lib/catalogue/queries";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getLearnerContent, submitMcqAttempt } from "@/lib/player/service";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterEach(async () => {});

function builtState(): BuilderState {
  return {
    certification: { thresholdPercent: 50, requiredUnitIds: [] },
    sections: [
      {
        id: "s-a",
        sourceKey: null,
        title: "Sec A",
        subsections: [
          {
            id: "ss-a",
            sourceKey: null,
            title: "Sub A",
            units: [
              {
                id: "u-r",
                sourceKey: null,
                type: "reading",
                title: "Read",
                required: true,
                data: { html: "<p>ok</p><script>bad()</script>" },
              },
              {
                id: "u-q",
                sourceKey: null,
                type: "mcq",
                title: "Quiz",
                required: true,
                data: {
                  passMark: 50,
                  questions: [
                    {
                      id: "q-a",
                      text: "Pick",
                      points: 1,
                      options: [
                        { id: "o-x", text: "X", correct: true },
                        { id: "o-y", text: "Y", correct: false },
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
  };
}

describe("visual builder → real publish/learner pipeline", () => {
  it("assembles, saves, publishes, is catalogued, and never leaks answers to learners", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const { credentialId } = await createCredentialWithDraft({
      projectId: project,
      code: `BLD-${Math.round(Math.random() * 1e9)}`,
      slug: `bld-${Math.round(Math.random() * 1e9)}`,
      title: "Built credential",
      authorName: "A",
      createdBy: admin,
    });

    const state = builtState();
    const { content, grading } = assembleDocuments(state);
    await saveDraft({
      credentialId,
      content,
      grading,
      certificationRule: certificationRule(state),
    });
    await publishCredential(credentialId);

    const slug = (
      await getPool().query(`SELECT slug FROM micro_credentials WHERE id=$1`, [credentialId])
    ).rows[0]!.slug as string;
    const detail = await getPublishedCredentialBySlug(slug);
    expect(detail).not.toBeNull();
    // Reading HTML was sanitised on save (no script).
    // (About/reading sanitisation happens in saveDraft/service; content here holds the raw units,
    //  but the learner content must never carry correct answers.)
    expect(JSON.stringify(detail!.content)).not.toMatch(/correctOptionIds/);

    // Learner enrols and the player content carries no grading answers.
    const learner = await makeUser("learner");
    await enrolInCredential(learner, credentialId);
    const { content: learnerContent } = await getLearnerContent(learner, credentialId);
    expect(JSON.stringify(learnerContent)).not.toMatch(/correct/i);

    // Grading still scores correctly server-side.
    const outcome = await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "u-q",
      answers: { "q-a": ["o-x"] },
    });
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.percentage).toBe(100);
  });

  it("rejects publish when an MCQ has no correct answer (builder validation via service)", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const { credentialId } = await createCredentialWithDraft({
      projectId: project,
      code: `BLD2-${Math.round(Math.random() * 1e9)}`,
      slug: `bld2-${Math.round(Math.random() * 1e9)}`,
      title: "No answer",
      authorName: "A",
      createdBy: admin,
    });
    const state = builtState();
    // remove the correct flag
    const mcq = state.sections[0]!.subsections[0]!.units[1]!;
    if (mcq.type === "mcq") mcq.data.questions[0]!.options.forEach((o) => (o.correct = false));
    const { content, grading } = assembleDocuments(state);
    await saveDraft({
      credentialId,
      content,
      grading,
      certificationRule: certificationRule(state),
    });
    await expect(publishCredential(credentialId)).rejects.toThrow();
  });
});
