import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createProgramme,
  setProgrammeCredentials,
  publishProgramme,
  hideProgramme,
  unhideProgramme,
} from "@/lib/programmes/service";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { enrolInCredential, registerForProgramme } from "@/lib/enrolments/service";
import { requireProgrammeAccess } from "@/lib/access/guards";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

async function publishedCredential(projectId: string, admin: string, unit = "u1") {
  const { credentialId } = await createCredentialWithDraft({
    projectId,
    code: `C-${Math.round(Math.random() * 1e9)}`,
    slug: `c-${Math.round(Math.random() * 1e9)}`,
    title: "C",
    authorName: "A",
    createdBy: admin,
  });
  const s = sampleContent(unit, `${unit}-q`, `${unit}-oa`, `${unit}-ob`);
  await saveDraft({
    credentialId,
    content: s.content,
    grading: s.grading,
    certificationRule: s.certificationRule,
  });
  await publishCredential(credentialId);
  return credentialId;
}

async function publishedProgramme(projectId: string, admin: string, credIds: string[]) {
  const prog = await createProgramme({
    projectId,
    slug: `p-${Math.round(Math.random() * 1e9)}`,
    title: "P",
    createdBy: admin,
  });
  await setProgrammeCredentials(
    prog,
    credIds.map((id, i) => ({ credentialId: id, position: i })),
  );
  await publishProgramme(prog);
  return prog;
}

describe("programme registration fan-out + dedup + idempotency", () => {
  it("creates one programme enrolment + one credential enrolment per member with a snapshot", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const a = await publishedCredential(project, admin, "ua");
    const b = await publishedCredential(project, admin, "ub");
    const prog = await publishedProgramme(project, admin, [a, b]);
    const learner = await makeUser("learner");

    await registerForProgramme(learner, prog);

    const progEnr = await getPool().query(
      `SELECT id, metadata FROM enrollments WHERE user_id=$1 AND programme_id=$2 AND credential_id IS NULL`,
      [learner, prog],
    );
    expect(progEnr.rowCount).toBe(1);
    const credEnr = await getPool().query(
      `SELECT credential_id, credential_version_id FROM enrollments WHERE user_id=$1 AND credential_id IS NOT NULL ORDER BY credential_id`,
      [learner],
    );
    expect(credEnr.rowCount).toBe(2); // one per member
    // snapshot records the assigned versions + enrolment ids
    const snap = (
      progEnr.rows[0]!.metadata as {
        registration?: {
          selectedCredentialVersionIds: Record<string, string>;
          credentialEnrollmentIds: Record<string, string>;
        };
      }
    ).registration!;
    expect(Object.keys(snap.selectedCredentialVersionIds).sort()).toEqual([a, b].sort());
    expect(Object.keys(snap.credentialEnrollmentIds).sort()).toEqual([a, b].sort());
    // each credential enrolment is bound to the member's current published version
    for (const row of credEnr.rows as { credential_id: string; credential_version_id: string }[]) {
      expect(snap.selectedCredentialVersionIds[row.credential_id]).toBe(row.credential_version_id);
    }
  });

  it("reuses a prior direct credential enrolment instead of duplicating it", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const a = await publishedCredential(project, admin, "ua");
    const b = await publishedCredential(project, admin, "ub");
    const prog = await publishedProgramme(project, admin, [a, b]);
    const learner = await makeUser("learner");

    const direct = await enrolInCredential(learner, a); // pre-existing direct enrolment
    await registerForProgramme(learner, prog);

    const aEnr = await getPool().query(
      `SELECT id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [learner, a],
    );
    expect(aEnr.rowCount).toBe(1); // NOT duplicated
    expect(aEnr.rows[0]!.id).toBe(direct.enrollmentId); // same row reused
    const total = await getPool().query(
      `SELECT count(*)::int c FROM enrollments WHERE user_id=$1 AND credential_id IS NOT NULL`,
      [learner],
    );
    expect(total.rows[0]!.c).toBe(2); // A (reused) + B
  });

  it("is idempotent — re-registering creates no duplicates", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const a = await publishedCredential(project, admin, "ua");
    const b = await publishedCredential(project, admin, "ub");
    const prog = await publishedProgramme(project, admin, [a, b]);
    const learner = await makeUser("learner");

    await registerForProgramme(learner, prog);
    await registerForProgramme(learner, prog);

    const progCount = await getPool().query(
      `SELECT count(*)::int c FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [learner, prog],
    );
    expect(progCount.rows[0]!.c).toBe(1);
    const credCount = await getPool().query(
      `SELECT count(*)::int c FROM enrollments WHERE user_id=$1 AND credential_id IS NOT NULL`,
      [learner],
    );
    expect(credCount.rows[0]!.c).toBe(2);
  });
});

describe("programme membership positions", () => {
  it("stores contiguous positions after a reorder", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const a = await publishedCredential(project, admin, "ua");
    const b = await publishedCredential(project, admin, "ub");
    const prog = await createProgramme({
      projectId: project,
      slug: `p-${Date.now()}`,
      title: "P",
      createdBy: admin,
    });
    // reversed order -> positions must remain contiguous 0,1
    await setProgrammeCredentials(prog, [
      { credentialId: b, position: 0 },
      { credentialId: a, position: 1 },
    ]);
    const rows = await getPool().query(
      `SELECT credential_id, position FROM programme_credentials WHERE programme_id=$1 ORDER BY position`,
      [prog],
    );
    expect((rows.rows as { position: number }[]).map((r) => r.position)).toEqual([0, 1]);
    expect((rows.rows as { credential_id: string }[])[0]!.credential_id).toBe(b); // reordered first
  });
});

describe("programme hide/unhide preserves history and credential independence", () => {
  it("hides the programme, preserves the enrolment+snapshot, and leaves member credentials published; unhide restores", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const a = await publishedCredential(project, admin, "ua");
    const b = await publishedCredential(project, admin, "ub");
    const prog = await publishedProgramme(project, admin, [a, b]);
    const learner = await makeUser("learner");
    await registerForProgramme(learner, prog);

    const before = await getPool().query(
      `SELECT id, metadata FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [learner, prog],
    );
    const beforeId = before.rows[0]!.id;

    await hideProgramme(prog);
    // programme page/registration blocked
    await expect(requireProgrammeAccess(prog)).rejects.toMatchObject({ kind: "hidden" });
    // member credentials remain published (independent status)
    const credStatuses = await getPool().query(
      `SELECT status FROM micro_credentials WHERE id = ANY($1)`,
      [[a, b]],
    );
    expect((credStatuses.rows as { status: string }[]).every((r) => r.status === "published")).toBe(
      true,
    );
    // programme enrolment + snapshot preserved
    const during = await getPool().query(
      `SELECT id, metadata FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [learner, prog],
    );
    expect(during.rows[0]!.id).toBe(beforeId);
    expect(during.rows[0]!.metadata).toEqual(before.rows[0]!.metadata);

    await unhideProgramme(prog);
    await expect(requireProgrammeAccess(prog)).resolves.toBeTruthy();
    const after = await getPool().query(
      `SELECT id FROM enrollments WHERE user_id=$1 AND programme_id=$2`,
      [learner, prog],
    );
    expect(after.rows[0]!.id).toBe(beforeId); // same enrolment
  });
});
