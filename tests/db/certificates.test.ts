import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { createProject } from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { submitMcqAttempt } from "@/lib/player/service";
import {
  issueCertificateIfEligible,
  verifyCertificate,
  revokeCertificate,
} from "@/lib/certificates/service";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const UNIT = "u-mcq-1";

async function setup(passMark = 50, issuerName = "RES4CITY") {
  const admin = await makeUser("admin");
  const project = await createProject({
    name: `Proj ${Math.random()}`,
    slug: `proj-${Math.round(Math.random() * 1e9)}`,
    organisationName: "Org Ltd",
    certificateTemplate: { issuerName },
  });
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `MC-${Math.round(Math.random() * 1e9)}`,
    slug: `mc-${Math.round(Math.random() * 1e9)}`,
    title: "Certifiable",
    authorName: "A",
    createdBy: admin,
  });
  const s = sampleContent(UNIT, "q1", "oa", "ob");
  s.certificationRule.thresholdPercent = passMark;
  await saveDraft({
    credentialId,
    content: s.content,
    grading: s.grading,
    certificationRule: s.certificationRule,
  });
  await publishCredential(credentialId);
  const learner = await makeUser("learner");
  const { enrollmentId } = await enrolInCredential(learner, credentialId);
  return { credentialId, learner, enrollmentId, issuerName };
}

describe("certificate issuance", () => {
  it("issues no certificate below threshold", async () => {
    const { credentialId, learner, enrollmentId } = await setup(50);
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["ob"] },
    }); // wrong → 0%
    const res = await issueCertificateIfEligible(enrollmentId);
    expect(res.issued).toBe(false);
    const count = await getPool().query(`SELECT count(*)::int c FROM certificates`);
    expect(count.rows[0]!.c).toBe(0);
  });

  it("issues one certificate to an eligible learner and never duplicates on retry", async () => {
    const { credentialId, learner, enrollmentId } = await setup(50);
    // passing submit auto-issues
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    const first = await issueCertificateIfEligible(enrollmentId); // idempotent retry
    expect(first.reused).toBe(true);
    const again = await issueCertificateIfEligible(enrollmentId);
    expect(again.reused).toBe(true);
    const count = await getPool().query(`SELECT count(*)::int c FROM certificates`);
    expect(count.rows[0]!.c).toBe(1);
  });

  it("uses the project's certificate template issuer and exposes only approved fields", async () => {
    const { credentialId, learner, enrollmentId, issuerName } = await setup(50, "Special Issuer");
    // Give the learner a real display name so the snapshot name isn't the email fallback.
    await getPool().query(
      `UPDATE app_users SET first_name='Ada', last_name='Lovelace' WHERE id=$1`,
      [learner],
    );
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    const codeRow = await getPool().query(
      `SELECT verification_code FROM certificates WHERE enrollment_id=$1`,
      [enrollmentId],
    );
    const code = codeRow.rows[0]!.verification_code as string;
    const v = await verifyCertificate(code);
    expect(v?.issuerName).toBe(issuerName);
    // Approved fields present; forbidden fields absent from the public projection.
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/@example.com/); // no email
    expect(json).not.toMatch(/clerk/i); // no clerk id
    expect(json).not.toMatch(/correctOptionIds/); // no grading
  });

  it("reports revoked and keeps a hidden credential's certificate verifiable", async () => {
    const { credentialId, learner, enrollmentId } = await setup(50);
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });
    const code = (
      await getPool().query(`SELECT verification_code FROM certificates WHERE enrollment_id=$1`, [
        enrollmentId,
      ])
    ).rows[0]!.verification_code as string;

    // hide credential → still verifiable
    await getPool().query(`UPDATE micro_credentials SET status='hidden' WHERE id=$1`, [
      credentialId,
    ]);
    expect((await verifyCertificate(code))?.status).toBe("issued");

    // revoke → reports revoked
    await revokeCertificate(enrollmentId, "test");
    expect((await verifyCertificate(code))?.revoked).toBe(true);
  });
});

describe("certificate pdf", () => {
  it("renders a valid PDF document", async () => {
    const bytes = await renderCertificatePdf({
      learnerName: "Ada Lovelace",
      credentialTitle: "Intro",
      credentialCode: "MC01",
      organisationName: "Org",
      issuerName: "Issuer",
      issueDate: "2026-07-20T00:00:00.000Z",
      verificationCode: "abc123",
      siteUrl: "http://localhost:3000",
    });
    // PDF magic header
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(500);
  });
});
