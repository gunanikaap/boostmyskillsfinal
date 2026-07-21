import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  createProject,
  saveDraft,
  publishCredential,
  hideCredential,
} from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getLearnerContent, recordUnitProgress, submitMcqAttempt } from "@/lib/player/service";
import { adminEnrolmentAnalytics, analyticsToCsv } from "@/lib/admin/analytics";
import { AccessError } from "@/lib/access/errors";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const READING = "u-read-1";
const MCQ = "u-mcq-1";

function readingUnit(id: string) {
  return {
    id,
    sourceKey: null,
    title: `Reading ${id}`,
    type: "reading" as const,
    required: true,
    data: { html: "<p>x</p>" },
  };
}
function mcqUnit(id: string) {
  return {
    id,
    sourceKey: null,
    title: `Quiz ${id}`,
    type: "mcq" as const,
    required: true,
    data: {
      passMark: 50,
      questions: [
        {
          id: "q1",
          text: "2+2?",
          options: [
            { id: "oa", text: "4" },
            { id: "ob", text: "5" },
          ],
        },
      ],
    },
  };
}
function gradingFor(mcqId: string) {
  return {
    schemaVersion: 1,
    units: [
      {
        unitId: mcqId,
        passMark: 50,
        maxAttempts: 1,
        questions: [{ questionId: "q1", correctOptionIds: ["oa"], points: 1 }],
      },
    ],
  };
}

/** Publish a credential from explicit units + rule, enrol a fresh learner. */
async function publishWith(opts: {
  units: ReturnType<typeof readingUnit | typeof mcqUnit>[];
  grading: ReturnType<typeof gradingFor> | { schemaVersion: 1; units: [] };
  requiredUnitIds: string[];
  threshold?: number;
}) {
  const admin = await makeUser("admin");
  const project = await createProject({
    name: `P ${Math.random()}`,
    slug: `p-${Math.round(Math.random() * 1e9)}`,
    organisationName: "Org",
    certificateTemplate: { issuerName: "Issuer" },
  });
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `MC-${Math.round(Math.random() * 1e9)}`,
    slug: `mc-${Math.round(Math.random() * 1e9)}`,
    title: "Cred",
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
          subsections: [{ id: "ss1", sourceKey: null, title: "SS", units: opts.units }],
        },
      ],
    },
    grading: opts.grading,
    certificationRule: {
      thresholdPercent: opts.threshold ?? 50,
      requiredUnitIds: opts.requiredUnitIds,
    },
  });
  await publishCredential(credentialId);
  const learner = await makeUser("learner");
  const { enrollmentId } = await enrolInCredential(learner, credentialId);
  return { credentialId, learner, enrollmentId };
}

const lastAccess = async (enrollmentId: string): Promise<string | null> =>
  (await getPool().query(`SELECT last_accessed_at FROM enrollments WHERE id=$1`, [enrollmentId]))
    .rows[0]!.last_accessed_at as string | null;
const certCount = async (): Promise<number> =>
  (await getPool().query(`SELECT count(*)::int c FROM certificates`)).rows[0]!.c as number;
const complete = (userId: string, credentialId: string, unitId: string) =>
  recordUnitProgress({ userId, credentialId, unitId, status: "completed", progressPercent: 100 });

describe("§5 last_accessed_at", () => {
  it("is updated on player open, progress write and assessment submit; not by another user; not when hidden", async () => {
    const { credentialId, learner, enrollmentId } = await publishWith({
      units: [readingUnit(READING), mcqUnit(MCQ)],
      grading: gradingFor(MCQ),
      requiredUnitIds: [],
    });
    expect(await lastAccess(enrollmentId)).toBeNull();

    await getLearnerContent(learner, credentialId);
    const t1 = await lastAccess(enrollmentId);
    expect(t1).not.toBeNull();

    await complete(learner, credentialId, READING);
    const t2 = await lastAccess(enrollmentId);
    expect(new Date(t2!).getTime()).toBeGreaterThanOrEqual(new Date(t1!).getTime());

    await submitMcqAttempt({ userId: learner, credentialId, unitId: MCQ, answers: { q1: ["oa"] } });
    const t3 = await lastAccess(enrollmentId);
    expect(new Date(t3!).getTime()).toBeGreaterThanOrEqual(new Date(t2!).getTime());

    // Another user cannot touch this enrolment (they are not enrolled).
    const intruder = await makeUser("learner");
    await expect(complete(intruder, credentialId, READING)).rejects.toBeInstanceOf(AccessError);

    // Admin analytics + CSV surface the same non-null timestamp.
    const rows = await adminEnrolmentAnalytics({ credentialId });
    expect(rows[0]!.lastAccess).not.toBeNull();
    expect(analyticsToCsv(rows)).toContain(rows[0]!.lastAccess!.slice(0, 10));
  });

  it("hidden-credential access does not update last_accessed_at", async () => {
    const { credentialId, learner, enrollmentId } = await publishWith({
      units: [readingUnit(READING)],
      grading: { schemaVersion: 1, units: [] },
      requiredUnitIds: [READING],
    });
    await hideCredential(credentialId, await makeUser("admin"));
    await expect(getLearnerContent(learner, credentialId)).rejects.toBeInstanceOf(AccessError);
    await expect(complete(learner, credentialId, READING)).rejects.toBeInstanceOf(AccessError);
    expect(await lastAccess(enrollmentId)).toBeNull();
  });
});

describe("§6 certificate issuance from every eligibility path", () => {
  it("no-MCQ credential: no cert before the required reading, cert after completing it", async () => {
    const { credentialId, learner } = await publishWith({
      units: [readingUnit(READING)],
      grading: { schemaVersion: 1, units: [] },
      requiredUnitIds: [READING],
    });
    // Opening / touching does not certify.
    await getLearnerContent(learner, credentialId);
    expect(await certCount()).toBe(0);
    // Completing the final required reading issues the certificate.
    await complete(learner, credentialId, READING);
    expect(await certCount()).toBe(1);
  });

  it("MCQ pass first, required reading completed later → certificate on the later progress action", async () => {
    const { credentialId, learner } = await publishWith({
      units: [readingUnit(READING), mcqUnit(MCQ)],
      grading: gradingFor(MCQ),
      requiredUnitIds: [READING], // reading required, MCQ graded
    });
    await submitMcqAttempt({ userId: learner, credentialId, unitId: MCQ, answers: { q1: ["oa"] } });
    expect(await certCount()).toBe(0); // reading not done yet → not eligible
    await complete(learner, credentialId, READING);
    expect(await certCount()).toBe(1);
  });

  it("required reading first, MCQ pass last → certificate; retries never duplicate", async () => {
    const { credentialId, learner, enrollmentId } = await publishWith({
      units: [readingUnit(READING), mcqUnit(MCQ)],
      grading: gradingFor(MCQ),
      requiredUnitIds: [READING],
    });
    await complete(learner, credentialId, READING);
    expect(await certCount()).toBe(0); // threshold not met yet (MCQ 0)
    await submitMcqAttempt({ userId: learner, credentialId, unitId: MCQ, answers: { q1: ["oa"] } });
    expect(await certCount()).toBe(1);
    // Replaying progress must not create a duplicate certificate.
    await complete(learner, credentialId, READING);
    expect(await certCount()).toBe(1);
    const rows = await getPool().query(
      `SELECT count(*)::int c FROM certificates WHERE enrollment_id=$1`,
      [enrollmentId],
    );
    expect(rows.rows[0]!.c).toBe(1);
  });

  it("progress is monotonic: a completed unit cannot regress and completed_at is stable", async () => {
    const { credentialId, learner, enrollmentId } = await publishWith({
      units: [readingUnit(READING)],
      grading: { schemaVersion: 1, units: [] },
      requiredUnitIds: [READING],
    });
    await complete(learner, credentialId, READING);
    const first = await getPool().query(
      `SELECT status, progress_percent, completed_at FROM unit_progress WHERE enrollment_id=$1 AND unit_id=$2`,
      [enrollmentId, READING],
    );
    const before = first.rows[0]! as {
      status: string;
      progress_percent: number;
      completed_at: string;
    };
    expect(before.status).toBe("completed");

    // A later/replayed weaker update must not regress status, percent, or completed_at.
    await recordUnitProgress({
      userId: learner,
      credentialId,
      unitId: READING,
      status: "in_progress",
      progressPercent: 10,
    });
    const after = (
      await getPool().query(
        `SELECT status, progress_percent, completed_at FROM unit_progress WHERE enrollment_id=$1 AND unit_id=$2`,
        [enrollmentId, READING],
      )
    ).rows[0]! as { status: string; progress_percent: number; completed_at: string };
    expect(after.status).toBe("completed");
    expect(Number(after.progress_percent)).toBe(100);
    expect(new Date(after.completed_at).getTime()).toBe(new Date(before.completed_at).getTime());
  });
});
