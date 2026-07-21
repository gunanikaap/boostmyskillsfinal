import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  createProject,
  saveDraft,
  publishCredential,
  createDraftFromPublished,
} from "@/lib/credentials/service";
import {
  createProgramme,
  setProgrammeCredentials,
  publishProgramme,
  hideProgramme,
  unhideProgramme,
} from "@/lib/programmes/service";
import { registerForProgramme } from "@/lib/enrolments/service";
import { recordUnitProgress } from "@/lib/player/service";
import { listMyProgrammeProgress } from "@/lib/programmes/progress";
import { ServiceError } from "@/lib/credentials/service";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

let n = 0;
async function publishReadingCred(
  projectId: string,
  admin: string,
): Promise<{ credentialId: string; readingId: string }> {
  const readingId = `u-read-${n++}`;
  const { credentialId } = await createCredentialWithDraft({
    projectId,
    code: `MC-${Math.round(Math.random() * 1e9)}`,
    slug: `mc-${Math.round(Math.random() * 1e9)}`,
    title: `Cred ${readingId}`,
    authorName: "A",
    createdBy: admin,
  });
  await saveDraft({
    credentialId,
    content: {
      schemaVersion: 1,
      sections: [
        {
          id: `s-${n}`,
          sourceKey: null,
          title: "S",
          subsections: [
            {
              id: `ss-${n}`,
              sourceKey: null,
              title: "SS",
              units: [
                {
                  id: readingId,
                  sourceKey: null,
                  title: "Reading",
                  type: "reading",
                  required: true,
                  data: { html: "<p>x</p>" },
                },
              ],
            },
          ],
        },
      ],
    },
    grading: { schemaVersion: 1, units: [] },
    certificationRule: { thresholdPercent: 50, requiredUnitIds: [readingId] },
  });
  await publishCredential(credentialId);
  return { credentialId, readingId };
}

async function setupProgramme() {
  const admin = await makeUser("admin");
  const projectId = await createProject({
    name: `P ${Math.random()}`,
    slug: `p-${Math.round(Math.random() * 1e9)}`,
    organisationName: "Org",
    certificateTemplate: { issuerName: "Issuer" },
  });
  const a = await publishReadingCred(projectId, admin);
  const b = await publishReadingCred(projectId, admin);
  const programmeId = await createProgramme({
    projectId,
    slug: `prog-${Math.round(Math.random() * 1e9)}`,
    title: `Prog ${Math.random()}`,
    createdBy: admin,
  });
  await setProgrammeCredentials(programmeId, [
    { credentialId: a.credentialId, position: 1, isRequired: true },
    { credentialId: b.credentialId, position: 2, isRequired: true },
  ]);
  await publishProgramme(programmeId);
  const learner = await makeUser("learner");
  await registerForProgramme(learner, programmeId);
  return { admin, projectId, a, b, programmeId, learner };
}

const prog = async (learner: string) => (await listMyProgrammeProgress(learner))[0]!;
const completeReading = (learner: string, credentialId: string, readingId: string) =>
  recordUnitProgress({
    userId: learner,
    credentialId,
    unitId: readingId,
    status: "completed",
    progressPercent: 100,
  });

describe("§4 programme aggregate progress", () => {
  it("starts at 0% and reaches 50% then 100% as members complete; counts 2 of 2", async () => {
    const { a, b, learner } = await setupProgramme();
    let p = await prog(learner);
    expect(p.aggregatePercent).toBe(0);
    expect(p.totalCount).toBe(2);
    expect(p.completedCount).toBe(0);

    await completeReading(learner, a.credentialId, a.readingId);
    p = await prog(learner);
    expect(p.aggregatePercent).toBe(50); // A 100, B 0
    expect(p.completedCount).toBe(1);

    await completeReading(learner, b.credentialId, b.readingId);
    p = await prog(learner);
    expect(p.aggregatePercent).toBe(100);
    expect(p.completedCount).toBe(2);
    expect(p.totalCount).toBe(2);
  });

  it("counts a shared direct/programme credential once and is idempotent on re-registration", async () => {
    const { a, b, programmeId, learner } = await setupProgramme();
    // Re-register — no new programme enrolment, no duplicate member.
    await registerForProgramme(learner, programmeId);
    const p = await prog(learner);
    expect(p.totalCount).toBe(2);
    expect(new Set(p.members.map((m) => m.credentialId)).size).toBe(2);
    // Exactly one credential enrolment per member for this learner.
    for (const c of [a.credentialId, b.credentialId]) {
      const cnt = await getPool().query(
        `SELECT count(*)::int c FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
        [learner, c],
      );
      expect(cnt.rows[0]!.c).toBe(1);
    }
    const progEnr = await getPool().query(
      `SELECT count(*)::int c FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [learner, programmeId],
    );
    expect(progEnr.rows[0]!.c).toBe(1);
  });

  it("publishing a new credential revision does not change an existing programme aggregate", async () => {
    const { admin, a, learner } = await setupProgramme();
    await completeReading(learner, a.credentialId, a.readingId);
    const before = await prog(learner);
    const beforeA = before.members.find((m) => m.credentialId === a.credentialId)!.percent;

    // Publish a brand-new revision of Credential A.
    await createDraftFromPublished(a.credentialId, admin);
    await publishCredential(a.credentialId);

    const after = await prog(learner);
    const afterA = after.members.find((m) => m.credentialId === a.credentialId)!.percent;
    expect(afterA).toBe(beforeA); // bound to the enrolment's original revision
    expect(after.aggregatePercent).toBe(before.aggregatePercent);
  });

  it("programme hide/unhide preserves the exact percentage and record IDs", async () => {
    const { a, b, programmeId, learner } = await setupProgramme();
    await completeReading(learner, a.credentialId, a.readingId);
    await completeReading(learner, b.credentialId, b.readingId);
    const before = await prog(learner);
    expect(before.aggregatePercent).toBe(100);

    await hideProgramme(programmeId);
    const hidden = await prog(learner);
    expect(hidden.hidden).toBe(true);
    expect(hidden.programmeStatus).toBe("hidden");
    expect(hidden.aggregatePercent).toBe(100); // read-only, preserved
    expect(hidden.programmeEnrollmentId).toBe(before.programmeEnrollmentId);
    expect(hidden.members.map((m) => m.enrollmentId).sort()).toEqual(
      before.members.map((m) => m.enrollmentId).sort(),
    );
    // Hiding the programme does not change member credential statuses.
    for (const c of [a.credentialId, b.credentialId]) {
      const st = await getPool().query(`SELECT status FROM micro_credentials WHERE id=$1`, [c]);
      expect(st.rows[0]!.status).toBe("published");
    }

    await unhideProgramme(programmeId);
    const restored = await prog(learner);
    expect(restored.hidden).toBe(false);
    expect(restored.aggregatePercent).toBe(100);
    expect(restored.programmeEnrollmentId).toBe(before.programmeEnrollmentId);
  });

  it("current programme_credentials changes cannot mutate a snapshot once registrations exist", async () => {
    const { a, programmeId, learner } = await setupProgramme();
    const before = await prog(learner);
    // Membership is locked after registrations — the historical snapshot is immutable.
    await expect(
      setProgrammeCredentials(programmeId, [
        { credentialId: a.credentialId, position: 1, isRequired: true },
      ]),
    ).rejects.toBeInstanceOf(ServiceError);
    const after = await prog(learner);
    expect(after.members.map((m) => m.credentialId).sort()).toEqual(
      before.members.map((m) => m.credentialId).sort(),
    );
  });
});
