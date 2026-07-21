import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { uploadProgrammeBanner } from "@/lib/storage/bannerService";
import { updateProgramme, hideProgramme, unhideProgramme } from "@/lib/programmes/service";
import { getPublishedProgrammeBySlug } from "@/lib/programmes/queries";
import { requireProgrammeAccess } from "@/lib/access/guards";
import { registerForProgramme } from "@/lib/enrolments/service";
import { StorageError } from "@/lib/storage/types";
import { getStorage } from "@/lib/storage/factory";
import { POST as bannerPOST } from "@/app/admin/programmes/[id]/banner/route";
import { resetDb, teardown } from "@/tests/helpers/db";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";
import { makeProject, makeProgramme, makeUser } from "@/tests/helpers/factories";
import { makePng } from "@/tests/helpers/images";

beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

const PNG = makePng(16, 9);
const PNG2 = makePng(24, 14);

function fileReq(bytes: Buffer): Request {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], "b.png", { type: "image/png" }));
  return new Request("http://x", { method: "POST", body: fd });
}

describe("programme banner upload", () => {
  it("1-3. stores a provider-neutral key (no absolute path) on the programme", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "draft");
    const { objectKey } = await uploadProgrammeBanner(prog, PNG);
    expect(objectKey).not.toMatch(/^([a-zA-Z]:[\\/]|\/|file:|https?:\/\/localhost)/);
    expect(objectKey).not.toMatch(/\\/);
    const row = await getPool().query(
      `SELECT banner_object_key FROM micro_programmes WHERE id=$1`,
      [prog],
    );
    expect(row.rows[0]!.banner_object_key).toBe(objectKey);
    expect((await getStorage().getObject(objectKey)).subarray(0, 8)).toEqual(PNG.subarray(0, 8));
  });

  it("4. draft programme banner/content is not public", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "draft");
    await uploadProgrammeBanner(prog, PNG);
    const slug = (await getPool().query(`SELECT slug FROM micro_programmes WHERE id=$1`, [prog]))
      .rows[0]!.slug as string;
    expect(await getPublishedProgrammeBySlug(slug)).toBeNull();
  });

  it("5. published programme exposes banner + About/context", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "published");
    await uploadProgrammeBanner(prog, PNG);
    await updateProgramme(prog, { title: "UAT Complete Programme", aboutHtml: "<p>context</p>" });
    const slug = (await getPool().query(`SELECT slug FROM micro_programmes WHERE id=$1`, [prog]))
      .rows[0]!.slug as string;
    const detail = await getPublishedProgrammeBySlug(slug);
    expect(detail?.bannerObjectKey).toBeTruthy();
    expect((detail?.aboutContent as { html: string }).html).toContain("context");
  });

  it("6. hidden programme detail + registration are blocked", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "published");
    await hideProgramme(prog);
    await expect(requireProgrammeAccess(prog)).rejects.toMatchObject({ kind: "hidden" });
    const learner = await makeUser("learner");
    await expect(registerForProgramme(learner, prog)).rejects.toMatchObject({
      code: "not_registerable",
    });
  });

  it("7. unhide restores the same programme record", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "published");
    await hideProgramme(prog);
    await unhideProgramme(prog);
    const row = await getPool().query(`SELECT id, status FROM micro_programmes WHERE id=$1`, [
      prog,
    ]);
    expect(row.rows[0]!.id).toBe(prog);
    expect(row.rows[0]!.status).toBe("published");
  });

  it("8. rejects an invalid image and preserves the previous banner on a failed replace", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "draft");
    const { objectKey: first } = await uploadProgrammeBanner(prog, PNG2);
    await expect(
      uploadProgrammeBanner(prog, Buffer.from("<html>not an image</html>")),
    ).rejects.toBeInstanceOf(StorageError);
    // previous banner still referenced (failed replace did not corrupt the programme)
    const row = await getPool().query(
      `SELECT banner_object_key FROM micro_programmes WHERE id=$1`,
      [prog],
    );
    expect(row.rows[0]!.banner_object_key).toBe(first);
  });
});

describe("programme banner upload authorization (route)", () => {
  it("9-10. denies learner (403) and anonymous (401)", async () => {
    const project = await makeProject();
    const prog = await makeProgramme(project, "draft");
    const params = { params: Promise.resolve({ id: prog }) };

    actAsAnonymous();
    expect((await bannerPOST(fileReq(PNG) as never, params)).status).toBe(401);
    await actAs("learner");
    expect((await bannerPOST(fileReq(PNG) as never, params)).status).toBe(403);
    await actAs("admin");
    const ok = await bannerPOST(fileReq(PNG) as never, params);
    expect(ok.status).toBe(200);
  });
});
