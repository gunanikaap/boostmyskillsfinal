import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  hideCredential,
} from "@/lib/credentials/service";
import { uploadCredentialBanner } from "@/lib/storage/bannerService";
import {
  isPublicBanner,
  bannerKeyExists,
  olxArchiveKeyForCredential,
} from "@/lib/storage/mediaAccess";
import { getStorage } from "@/lib/storage/factory";
import { importOlxToDraft } from "@/lib/olx/importer";
import { exportCredentialToOlx } from "@/lib/olx/exporter";
import { GET as olxArchiveGET } from "@/app/admin/credentials/[id]/olx-archive/route";
import { GET as mediaGET } from "@/app/media/[...key]/route";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makePng } from "@/tests/helpers/images";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";
import { makeProject, makeUser, sampleContent } from "@/tests/helpers/factories";

beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

const PNG = makePng(16, 9);

async function credentialWithBanner(status: "published" | "draft" | "hidden") {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `C-${Math.round(Math.random() * 1e9)}`,
    slug: `c-${Math.round(Math.random() * 1e9)}`,
    title: "Banner cred",
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
  const { objectKey } = await uploadCredentialBanner(credentialId, PNG);
  if (status !== "draft") await publishCredential(credentialId);
  if (status === "hidden") await hideCredential(credentialId, admin);
  return { credentialId, objectKey, admin };
}

describe("banner storage + access", () => {
  it("11. a published banner is public and served", async () => {
    const { objectKey } = await credentialWithBanner("published");
    expect(await isPublicBanner(objectKey)).toBe(true);
    const bytes = await getStorage().getObject(objectKey);
    expect(bytes.subarray(0, 8)).toEqual(PNG.subarray(0, 8)); // PNG signature
    // media route serves it publicly (anonymous)
    const res = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ key: objectKey.split("/") }),
    });
    expect(res.status).toBe(200);
  });

  it("12. a draft banner is NOT public; anon is denied, admin may preview", async () => {
    const { objectKey } = await credentialWithBanner("draft");
    expect(await isPublicBanner(objectKey)).toBe(false);
    expect(await bannerKeyExists(objectKey)).toBe(true);
    // anonymous → not served
    const anon = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ key: objectKey.split("/") }),
    });
    expect([401, 404]).toContain(anon.status);
    // admin → served
    await actAs("admin");
    const adminRes = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ key: objectKey.split("/") }),
    });
    expect(adminRes.status).toBe(200);
  });

  it("hidden credential banner is not public", async () => {
    const { objectKey } = await credentialWithBanner("hidden");
    expect(await isPublicBanner(objectKey)).toBe(false);
  });
});

describe("private OLX archive access", () => {
  async function importArchive() {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const s = sampleContent("u1", "q1", "oa", "ob");
    const gz = exportCredentialToOlx(s.content as never, s.grading as never, {
      code: "MC-OLX",
      slug: "mc-olx",
      title: "OLX",
      authorName: "A",
      certificationRule: s.certificationRule,
    });
    const res = await importOlxToDraft({
      gz,
      originalFilename: "c.tar.gz",
      projectId: project,
      adminId: admin,
    });
    return res.credentialId;
  }

  it("13-15. OLX archive: denied anonymous, denied learner, allowed admin", async () => {
    const credentialId = await importArchive();
    const key = await olxArchiveKeyForCredential(credentialId);
    expect(key).toBeTruthy();
    // stored & retrievable via provider
    expect((await getStorage().getObject(key!)).subarray(0, 2).toString("hex")).toBe("1f8b"); // gzip magic

    const params = { params: Promise.resolve({ id: credentialId }) };
    actAsAnonymous();
    expect((await olxArchiveGET(new Request("http://x"), params)).status).toBe(401);
    await actAs("learner");
    expect((await olxArchiveGET(new Request("http://x"), params)).status).toBe(403);
    await actAs("admin");
    const ok = await olxArchiveGET(new Request("http://x"), params);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/gzip");

    // OLX key is never served through the public /media route (even for admin).
    const viaMedia = await mediaGET(new Request("http://x"), {
      params: Promise.resolve({ key: key!.split("/") }),
    });
    expect(viaMedia.status).toBe(404);
  });
});
