import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  hideCredential,
} from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getStorage } from "@/lib/storage/factory";
import { GET as assetGet } from "@/app/content-asset/[...key]/route";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";

beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

function call(key: string) {
  return assetGet(new Request(`http://x/content-asset/${key}`), {
    params: Promise.resolve({ key: key.split("/") }),
  });
}

async function setup() {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const u = randomUUID().slice(0, 8);
  const { credentialId, versionId } = await createCredentialWithDraft({
    projectId: project,
    code: `MC-${u}`,
    slug: `mc-${u}`,
    title: "Asset Cred",
    authorName: "A",
    createdBy: admin,
  });
  const key = `content/${credentialId}/${versionId}/asset.pdf`;
  const content = {
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
                id: "r1",
                sourceKey: null,
                type: "reading",
                title: "R",
                required: true,
                data: { html: "<p>ok</p>" },
              },
              {
                id: "p1",
                sourceKey: null,
                type: "pdf",
                title: "Doc",
                required: true,
                data: { objectKey: key, filename: "a.pdf" },
              },
            ],
          },
        ],
      },
    ],
  };
  await saveDraft({
    credentialId,
    content,
    grading: { schemaVersion: 1, units: [] },
    certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
  });
  await publishCredential(credentialId);
  await getStorage().putObject(key, Buffer.from("%PDF-1.4 test"), {
    contentType: "application/pdf",
    maxBytes: 1_000_000,
  });
  return { admin, credentialId, versionId, key };
}

describe("content-asset revision-bound authorization (ASSET-P2-002)", () => {
  it("serves an enrolled learner the referenced key of their assigned revision", async () => {
    const { credentialId, key } = await setup();
    const { userId: learner } = await actAs("learner");
    await enrolInCredential(learner, credentialId);
    const res = await call(key);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("denies an unreferenced key even for an enrolled learner", async () => {
    const { credentialId, versionId } = await setup();
    const { userId: learner } = await actAs("learner");
    await enrolInCredential(learner, credentialId);
    const res = await call(`content/${credentialId}/${versionId}/other.pdf`);
    expect(res.status).toBe(404);
  });

  it("denies a key naming a revision the learner is not assigned to", async () => {
    const { credentialId } = await setup();
    const { userId: learner } = await actAs("learner");
    await enrolInCredential(learner, credentialId);
    const res = await call(`content/${credentialId}/${randomUUID()}/asset.pdf`);
    expect(res.status).toBe(404);
  });

  it("denies a key for another credential", async () => {
    const { key } = await setup();
    const { userId: learner } = await actAs("learner");
    // Learner is NOT enrolled in the credential named by the key.
    const res = await call(key);
    expect(res.status).toBe(404);
    void learner;
  });

  it("denies an enrolled learner while the credential is hidden", async () => {
    const { credentialId, key, admin } = await setup();
    const { userId: learner } = await actAs("learner");
    await enrolInCredential(learner, credentialId);
    await hideCredential(credentialId, admin);
    const res = await call(key);
    expect(res.status).toBe(404);
  });

  it("lets an active admin preview a referenced key (even when hidden)", async () => {
    const { credentialId, key, admin } = await setup();
    await hideCredential(credentialId, admin);
    await actAs("admin");
    const res = await call(key);
    expect(res.status).toBe(200);
  });

  it("denies an admin an unreferenced key (no arbitrary browsing)", async () => {
    const { credentialId, versionId } = await setup();
    await actAs("admin");
    const res = await call(`content/${credentialId}/${versionId}/other.pdf`);
    expect(res.status).toBe(404);
  });

  it("denies a deactivated admin (401)", async () => {
    const { key } = await setup();
    const { userId: adminId } = await actAs("admin");
    await getPool().query(`UPDATE app_users SET deactivated_at = now() WHERE id = $1`, [adminId]);
    const res = await call(key);
    expect(res.status).toBe(401);
  });

  it("denies an anonymous caller (401) and a malformed key (404)", async () => {
    const { key } = await setup();
    actAsAnonymous();
    expect((await call(key)).status).toBe(401);
    await actAs("learner");
    expect((await call("content/not-a-uuid/also-bad/x.pdf")).status).toBe(404);
  });
});
