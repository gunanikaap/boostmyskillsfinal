import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  hideCredential,
  unhideCredential,
} from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getLearnerContent, submitMcqAttempt, recordUnitProgress } from "@/lib/player/service";
import { verifyCertificate } from "@/lib/certificates/service";
import { listPublishedCredentials, getPublishedCredentialBySlug } from "@/lib/catalogue/queries";
import { requirePublishedCredentialAccess } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const UNIT = "u-mcq-1";

/**
 * The full 20-step hidden-content lifecycle (§14). A learner completes and is
 * certified, the credential is hidden, all live content/progress/assessment
 * access is blocked while every historical record + the certificate are
 * preserved, then it is unhidden and the learner resumes on the SAME enrolment
 * and revision.
 */
describe("hidden-content full lifecycle", () => {
  it("hides then unhides while preserving all learner history", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const { credentialId } = await createCredentialWithDraft({
      projectId: project,
      code: `MC-${Math.round(Math.random() * 1e9)}`,
      slug: `mc-hidden-${Math.round(Math.random() * 1e9)}`,
      title: "Hidden lifecycle",
      authorName: "A",
      createdBy: admin,
    });
    const slug = (
      await getPool().query(`SELECT slug FROM micro_credentials WHERE id=$1`, [credentialId])
    ).rows[0]!.slug as string;
    const s = sampleContent(UNIT, "q1", "oa", "ob");
    await saveDraft({
      credentialId,
      content: s.content,
      grading: s.grading,
      certificationRule: s.certificationRule,
    });
    await publishCredential(credentialId);

    // 1. Published enrolled credential opens.
    const learner = await makeUser("learner");
    const { enrollmentId } = await enrolInCredential(learner, credentialId).then(async (e) => ({
      enrollmentId: e.enrollmentId,
    }));
    await expect(getLearnerContent(learner, credentialId)).resolves.toBeTruthy();

    // learner passes → certificate issued automatically
    const attempt = await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    expect(attempt.result.passed).toBe(true);
    const certRow = await getPool().query(
      `SELECT verification_code FROM certificates WHERE enrollment_id=$1`,
      [enrollmentId],
    );
    const verificationCode = certRow.rows[0]!.verification_code as string;
    expect(verificationCode).toBeTruthy();

    // capture pre-hide state
    const versionBefore = (
      await getPool().query(`SELECT credential_version_id FROM enrollments WHERE id=$1`, [
        enrollmentId,
      ])
    ).rows[0]!.credential_version_id;
    const progressBefore = (
      await getPool().query(
        `SELECT status, progress_percent FROM unit_progress WHERE enrollment_id=$1`,
        [enrollmentId],
      )
    ).rows[0];
    const attemptsBefore = (
      await getPool().query(
        `SELECT percentage, passed FROM assessment_attempts WHERE enrollment_id=$1`,
        [enrollmentId],
      )
    ).rows[0];

    // 2. Admin hides it.
    await hideCredential(credentialId, admin);

    // 3. Disappears from the catalogue. 4. Public detail inaccessible.
    expect((await listPublishedCredentials()).find((c) => c.id === credentialId)).toBeUndefined();
    expect(await getPublishedCredentialBySlug(slug)).toBeNull();
    await expect(requirePublishedCredentialAccess(credentialId)).rejects.toMatchObject({
      kind: "hidden",
    });

    // 5. Existing learner unit route inaccessible.
    await expect(getLearnerContent(learner, credentialId)).rejects.toMatchObject({
      kind: "hidden",
    });
    // 6. Progress writes rejected.
    await expect(
      recordUnitProgress({
        userId: learner,
        credentialId,
        unitId: UNIT,
        status: "in_progress",
        progressPercent: 20,
      }),
    ).rejects.toMatchObject({ kind: "hidden" });
    // 7. MCQ submission rejected.
    await expect(
      submitMcqAttempt({ userId: learner, credentialId, unitId: UNIT, answers: { q1: ["oa"] } }),
    ).rejects.toMatchObject({ kind: "hidden" });
    // 8. New enrolment rejected.
    const learner2 = await makeUser("learner");
    await expect(enrolInCredential(learner2, credentialId)).rejects.toMatchObject({
      code: "not_enrollable",
    });

    // 9-12. Enrolment, progress, attempts, grade preserved & unchanged.
    const enrStill = await getPool().query(`SELECT id FROM enrollments WHERE id=$1`, [
      enrollmentId,
    ]);
    expect(enrStill.rowCount).toBe(1);
    const progressAfter = (
      await getPool().query(
        `SELECT status, progress_percent FROM unit_progress WHERE enrollment_id=$1`,
        [enrollmentId],
      )
    ).rows[0];
    expect(progressAfter).toEqual(progressBefore);
    const attemptsAfter = (
      await getPool().query(
        `SELECT percentage, passed FROM assessment_attempts WHERE enrollment_id=$1`,
        [enrollmentId],
      )
    ).rows[0];
    expect(attemptsAfter).toEqual(attemptsBefore);

    // 13. Certificate remains downloadable (record exists). 14. Publicly verifiable.
    const verif = await verifyCertificate(verificationCode);
    expect(verif?.status).toBe("issued");

    // 15. Admin retains access (admin path uses adminGetCredential — row present).
    const adminView = await getPool().query(`SELECT status FROM micro_credentials WHERE id=$1`, [
      credentialId,
    ]);
    expect(adminView.rows[0]!.status).toBe("hidden");

    // 16. Admin unhides.
    await unhideCredential(credentialId);
    // 17. Original enrolment id unchanged. 18. Original version unchanged.
    const enrAfter = await getPool().query(
      `SELECT id, credential_version_id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [learner, credentialId],
    );
    expect(enrAfter.rows[0]!.id).toBe(enrollmentId);
    expect(enrAfter.rows[0]!.credential_version_id).toBe(versionBefore);
    // 19. Progress unchanged. 20. Learner resumes.
    const progressResume = (
      await getPool().query(`SELECT status FROM unit_progress WHERE enrollment_id=$1`, [
        enrollmentId,
      ])
    ).rows[0];
    expect(progressResume).toEqual({ status: "completed" });
    await expect(getLearnerContent(learner, credentialId)).resolves.toBeTruthy();
  });
});
