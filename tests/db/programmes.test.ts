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

  it("rejects credentials from a different organisation", async () => {
    const admin = await makeUser("admin");
    // makeProject gives each project a distinct organisation, so a credential
    // under projectB has a different organisation than a programme under projectA.
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
    ).rejects.toMatchObject({ code: "organisation_mismatch" });
  });

  it("allows credentials of the same organisation across different projects", async () => {
    const admin = await makeUser("admin");
    const org = "Shared University";
    const projectA = await makeProject();
    const projectB = await makeProject();
    const rnd = () => Math.round(Math.random() * 1e9);
    const mk = async (projectId: string) =>
      (
        await createCredentialWithDraft({
          projectId,
          code: `C-${rnd()}`,
          slug: `c-${rnd()}`,
          title: "C",
          authorName: "A",
          organisationName: org,
          createdBy: admin,
        })
      ).credentialId;
    const a = await mk(projectA);
    const b = await mk(projectB);
    const prog = await createProgramme({
      projectId: projectA,
      slug: `p-${rnd()}`,
      title: "P",
      organisationName: org,
      createdBy: admin,
    });
    // Same organisation on both credentials + programme → accepted despite the
    // credentials living under different projects.
    await setProgrammeCredentials(prog, [
      { credentialId: a, position: 0 },
      { credentialId: b, position: 1 },
    ]);
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM programme_credentials WHERE programme_id = $1`,
      [prog],
    );
    expect(rows[0]!.n).toBe(2);
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
