import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createProgramme,
  setProgrammeCredentials,
  publishProgramme,
  hideProgramme,
} from "@/lib/programmes/service";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { listPublishedProgrammes } from "@/lib/catalogue/queries";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, makeCredential, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

async function publishedCredential(projectId: string, admin: string) {
  const { credentialId } = await createCredentialWithDraft({
    projectId,
    code: `C-${Math.round(Math.random() * 1e9)}`,
    slug: `c-${Math.round(Math.random() * 1e9)}`,
    title: "C",
    authorName: "A",
    createdBy: admin,
  });
  const s = sampleContent();
  await saveDraft({
    credentialId,
    content: s.content,
    grading: s.grading,
    certificationRule: s.certificationRule,
  });
  await publishCredential(credentialId);
  return credentialId;
}

describe("programme membership validation", () => {
  it("rejects duplicate credentials", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const c1 = await publishedCredential(project, admin);
    const prog = await createProgramme({
      projectId: project,
      slug: `p-${Date.now()}`,
      title: "P",
      createdBy: admin,
    });
    await expect(
      setProgrammeCredentials(prog, [
        { credentialId: c1, position: 0 },
        { credentialId: c1, position: 1 },
      ]),
    ).rejects.toMatchObject({ code: "duplicate_credential" });
  });

  it("rejects credentials from a different project", async () => {
    const admin = await makeUser("admin");
    const projectA = await makeProject();
    const projectB = await makeProject();
    const cB = await makeCredential(projectB, "published");
    const prog = await createProgramme({
      projectId: projectA,
      slug: `p-${Date.now()}`,
      title: "P",
      createdBy: admin,
    });
    await expect(
      setProgrammeCredentials(prog, [{ credentialId: cB, position: 0 }]),
    ).rejects.toMatchObject({ code: "project_mismatch" });
  });

  it("locks membership once a registration exists", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const c1 = await publishedCredential(project, admin);
    const prog = await createProgramme({
      projectId: project,
      slug: `p-${Date.now()}`,
      title: "P",
      createdBy: admin,
    });
    await setProgrammeCredentials(prog, [{ credentialId: c1, position: 0 }]);
    await publishProgramme(prog);
    // a learner registers
    const learner = await makeUser("learner");
    await getPool().query(`INSERT INTO enrollments (user_id, programme_id) VALUES ($1,$2)`, [
      learner,
      prog,
    ]);
    await expect(
      setProgrammeCredentials(prog, [{ credentialId: c1, position: 0 }]),
    ).rejects.toMatchObject({ code: "membership_locked" });
  });
});

describe("programme publish/hide visibility", () => {
  it("only publishes with publishable members and appears in catalogue; hidden disappears", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const prog = await createProgramme({
      projectId: project,
      slug: `p-${Date.now()}`,
      title: "Prog",
      createdBy: admin,
    });

    // a draft credential member cannot be published in a programme
    const draftCred = await makeCredential(project, "draft");
    await setProgrammeCredentials(prog, [{ credentialId: draftCred, position: 0 }]);
    await expect(publishProgramme(prog)).rejects.toMatchObject({ code: "unpublishable_member" });

    // swap to a published credential
    const pub = await publishedCredential(project, admin);
    await setProgrammeCredentials(prog, [{ credentialId: pub, position: 0 }]);
    await publishProgramme(prog);
    expect((await listPublishedProgrammes()).find((p) => p.id === prog)).toBeTruthy();

    await hideProgramme(prog);
    expect((await listPublishedProgrammes()).find((p) => p.id === prog)).toBeUndefined();
  });
});
