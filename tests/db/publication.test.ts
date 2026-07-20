import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import {
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  createDraftFromPublished,
  hideCredential,
} from "@/lib/credentials/service";
import {
  listPublishedCredentials,
  getPublishedCredentialBySlug,
  currentPublishedVersionId,
} from "@/lib/catalogue/queries";
import { ContentValidationError } from "@/lib/content/validate";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

async function newCredential(slug = "mc-pub") {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `CODE-${slug}-${Math.round(Math.random() * 1e9)}`,
    slug: `${slug}-${Math.round(Math.random() * 1e9)}`,
    title: "Credential",
    authorName: "Author",
    createdBy: admin,
  });
  return { admin, credentialId };
}

describe("publication visibility", () => {
  it("draft is invisible; published is visible; hidden is invisible", async () => {
    const { admin, credentialId } = await newCredential();
    const slug = (await getPool().query(`SELECT slug FROM micro_credentials WHERE id=$1`, [credentialId]))
      .rows[0]!.slug as string;

    // draft → not in catalogue, detail null
    expect((await listPublishedCredentials()).find((c) => c.id === credentialId)).toBeUndefined();
    expect(await getPublishedCredentialBySlug(slug)).toBeNull();

    // publish
    await saveDraft({ credentialId, ...sampleContentPayload() });
    await publishCredential(credentialId);
    expect((await listPublishedCredentials()).find((c) => c.id === credentialId)).toBeTruthy();
    expect(await getPublishedCredentialBySlug(slug)).not.toBeNull();

    // hide
    await hideCredential(credentialId, admin);
    expect((await listPublishedCredentials()).find((c) => c.id === credentialId)).toBeUndefined();
    expect(await getPublishedCredentialBySlug(slug)).toBeNull();
  });
});

function sampleContentPayload() {
  const s = sampleContent();
  return { content: s.content, grading: s.grading, certificationRule: s.certificationRule };
}

describe("publish validation", () => {
  it("rejects publishing when grading references an unknown option (atomic rollback)", async () => {
    const { credentialId } = await newCredential("mc-bad");
    const s = sampleContent();
    s.grading.units[0]!.questions[0]!.correctOptionIds = ["nope"];
    await saveDraft({ credentialId, content: s.content, grading: s.grading, certificationRule: s.certificationRule });
    await expect(publishCredential(credentialId)).rejects.toBeInstanceOf(ContentValidationError);
    // nothing changed: still draft, credential still draft
    const v = await getPool().query(`SELECT status FROM credential_versions WHERE credential_id=$1`, [credentialId]);
    expect(v.rows[0]!.status).toBe("draft");
    const c = await getPool().query(`SELECT status FROM micro_credentials WHERE id=$1`, [credentialId]);
    expect(c.rows[0]!.status).toBe("draft");
  });

  it("rejects publishing content with duplicate stable ids", async () => {
    const { credentialId } = await newCredential("mc-dup");
    const s = sampleContent();
    s.content.sections[0]!.subsections[0]!.id = s.content.sections[0]!.id; // duplicate
    await saveDraft({ credentialId, content: s.content, grading: s.grading, certificationRule: s.certificationRule });
    await expect(publishCredential(credentialId)).rejects.toBeInstanceOf(ContentValidationError);
  });
});

describe("revisions and learner binding", () => {
  it("existing learner stays on the old revision; a new learner gets the new one", async () => {
    const { admin, credentialId } = await newCredential("mc-rev");
    await saveDraft({ credentialId, ...sampleContentPayload() });
    await publishCredential(credentialId);
    const v1 = await currentPublishedVersionId(credentialId);
    expect(v1).toBeTruthy();

    // learner A enrols on v1
    const learnerA = await makeUser("learner");
    await getPool().query(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3)`,
      [learnerA, credentialId, v1],
    );

    // new draft (revision 2) → publish → v1 retired, v2 published
    await createDraftFromPublished(credentialId, admin);
    // tweak title only; content ids preserved so still valid
    await saveDraft({ credentialId, title: "Credential v2" });
    await publishCredential(credentialId);
    const v2 = await currentPublishedVersionId(credentialId);
    expect(v2).not.toBe(v1);

    // learner B enrols → gets v2
    const learnerB = await makeUser("learner");
    await getPool().query(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3)`,
      [learnerB, credentialId, v2],
    );

    const a = await getPool().query(`SELECT credential_version_id FROM enrollments WHERE user_id=$1`, [learnerA]);
    const b = await getPool().query(`SELECT credential_version_id FROM enrollments WHERE user_id=$1`, [learnerB]);
    expect(a.rows[0]!.credential_version_id).toBe(v1); // unchanged
    expect(b.rows[0]!.credential_version_id).toBe(v2);

    // old revision retired, exactly one published
    const counts = await getPool().query(
      `SELECT status, count(*)::int FROM credential_versions WHERE credential_id=$1 GROUP BY status`,
      [credentialId],
    );
    const map = Object.fromEntries((counts.rows as { status: string; count: number }[]).map((r) => [r.status, r.count]));
    expect(map.published).toBe(1);
    expect(map.retired).toBe(1);
  });

  it("published revision content is immutable — saveDraft only touches a draft", async () => {
    const { credentialId } = await newCredential("mc-immut");
    await saveDraft({ credentialId, ...sampleContentPayload() });
    await publishCredential(credentialId);
    // no draft now → saveDraft must refuse
    await expect(saveDraft({ credentialId, title: "hack" })).rejects.toMatchObject({ code: "no_draft" });
  });
});
