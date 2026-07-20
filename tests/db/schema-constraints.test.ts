import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { runMigrations } from "@/scripts/db/migrate.mts";
import { testDatabaseUrl } from "@/lib/env";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, makeCredential, makeProgramme } from "@/tests/helpers/factories";

beforeEach(async () => {
  await resetDb();
});
afterAll(teardown);

async function insertPublishedVersion(credentialId: string, userId: string, revision = 1) {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO credential_versions
       (credential_id, revision_number, status, schema_version, title, author_name,
        about_content, content_document, grading_document, certification_rule, source_metadata,
        created_by, published_at)
     VALUES ($1,$2,'published',1,'T','A','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
             '{"sourceType":"native"}'::jsonb,$3, now())
     RETURNING id`,
    [credentialId, revision, userId],
  );
  return rows[0]!.id;
}

async function insertDraftVersion(credentialId: string, userId: string, revision: number) {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO credential_versions
       (credential_id, revision_number, status, schema_version, title, author_name,
        about_content, content_document, grading_document, certification_rule, source_metadata, created_by)
     VALUES ($1,$2,'draft',1,'T','A','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
             '{"sourceType":"native"}'::jsonb,$3)
     RETURNING id`,
    [credentialId, revision, userId],
  );
  return rows[0]!.id;
}

describe("migration", () => {
  it("applies to an empty database and re-applying is a no-op", async () => {
    // resetDb already ran migrations. A second run must apply nothing.
    const applied = await runMigrations(testDatabaseUrl());
    expect(applied).toEqual([]);
  });
});

describe("enrollments constraints", () => {
  it("rejects an invalid enrolment target (neither/both kinds)", async () => {
    const user = await makeUser();
    // neither programme nor credential
    await expect(
      getPool().query(`INSERT INTO enrollments (user_id) VALUES ($1)`, [user]),
    ).rejects.toThrow(/chk_enrolment_kind/);
  });

  it("rejects a duplicate direct credential enrolment", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project, "published");
    const ver = await insertPublishedVersion(cred, user);
    const ins = () =>
      getPool().query(
        `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3)`,
        [user, cred, ver],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/uq_one_credential_enrolment|duplicate key/);
  });

  it("rejects a duplicate programme enrolment", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const prog = await makeProgramme(project);
    const ins = () =>
      getPool().query(`INSERT INTO enrollments (user_id, programme_id) VALUES ($1,$2)`, [
        user,
        prog,
      ]);
    await ins();
    await expect(ins()).rejects.toThrow(/uq_one_programme_enrolment|duplicate key/);
  });

  it("rejects a credential/version mismatch (version belongs to a different credential)", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const credA = await makeCredential(project, "published");
    const credB = await makeCredential(project, "published");
    const verB = await insertPublishedVersion(credB, user);
    await expect(
      getPool().query(
        `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3)`,
        [user, credA, verB],
      ),
    ).rejects.toThrow(/does not belong/);
  });
});

describe("credential_versions constraints", () => {
  it("allows at most one draft revision per credential", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project);
    await insertDraftVersion(cred, user, 1);
    await expect(insertDraftVersion(cred, user, 2)).rejects.toThrow(
      /uq_one_draft_per_credential|duplicate key/,
    );
  });

  it("allows at most one published revision per credential", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project, "published");
    await insertPublishedVersion(cred, user, 1);
    await expect(insertPublishedVersion(cred, user, 2)).rejects.toThrow(
      /uq_one_published_per_credential|duplicate key/,
    );
  });

  it("requires published_at for published revisions", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project);
    await expect(
      getPool().query(
        `INSERT INTO credential_versions
           (credential_id, revision_number, status, schema_version, title, author_name,
            about_content, content_document, grading_document, certification_rule, source_metadata, created_by)
         VALUES ($1,1,'published',1,'T','A','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$2)`,
        [cred, user],
      ),
    ).rejects.toThrow(/chk_published_at_present/);
  });
});

describe("unit_progress + assessment_attempts constraints", () => {
  async function enrolCredential() {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project, "published");
    const ver = await insertPublishedVersion(cred, user);
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3) RETURNING id`,
      [user, cred, ver],
    );
    return rows[0]!.id;
  }

  it("enforces unit_progress uniqueness per (enrollment, unit)", async () => {
    const enr = await enrolCredential();
    const ins = () =>
      getPool().query(
        `INSERT INTO unit_progress (enrollment_id, unit_id, status, progress_percent, state)
         VALUES ($1,'u1','in_progress',10,'{}'::jsonb)`,
        [enr],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/uq_unit_progress|duplicate key/);
  });

  it("rejects progress_percent out of range", async () => {
    const enr = await enrolCredential();
    await expect(
      getPool().query(
        `INSERT INTO unit_progress (enrollment_id, unit_id, status, progress_percent, state)
         VALUES ($1,'u2','in_progress',150,'{}'::jsonb)`,
        [enr],
      ),
    ).rejects.toThrow(/progress_percent/);
  });

  it("enforces attempt uniqueness per (enrollment, unit, attempt_number)", async () => {
    const enr = await enrolCredential();
    const ins = () =>
      getPool().query(
        `INSERT INTO assessment_attempts
           (enrollment_id, unit_id, attempt_number, submitted_answers, grading_snapshot)
         VALUES ($1,'u1',1,'{}'::jsonb,'{}'::jsonb)`,
        [enr],
      );
    await ins();
    await expect(ins()).rejects.toThrow(/uq_attempt|duplicate key/);
  });

  it("rejects score greater than maximum_score", async () => {
    const enr = await enrolCredential();
    await expect(
      getPool().query(
        `INSERT INTO assessment_attempts
           (enrollment_id, unit_id, attempt_number, submitted_answers, score, maximum_score, grading_snapshot)
         VALUES ($1,'u3',1,'{}'::jsonb, 10, 5, '{}'::jsonb)`,
        [enr],
      ),
    ).rejects.toThrow(/chk_score_within_max/);
  });
});

describe("certificates + platform_settings constraints", () => {
  it("enforces one certificate per enrollment and unique verification code", async () => {
    const user = await makeUser();
    const project = await makeProject();
    const cred = await makeCredential(project, "published");
    const ver = await insertPublishedVersion(cred, user);
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO enrollments (user_id, credential_id, credential_version_id) VALUES ($1,$2,$3) RETURNING id`,
      [user, cred, ver],
    );
    const enr = rows[0]!.id;
    await getPool().query(
      `INSERT INTO certificates (verification_code, enrollment_id, certificate_snapshot)
       VALUES ('VC-1',$1,'{}'::jsonb)`,
      [enr],
    );
    await expect(
      getPool().query(
        `INSERT INTO certificates (verification_code, enrollment_id, certificate_snapshot)
         VALUES ('VC-2',$1,'{}'::jsonb)`,
        [enr],
      ),
    ).rejects.toThrow(/certificates_enrollment_id_key|duplicate key/);
  });

  it("rejects a platform_settings row with id != 1 and prevents deleting the singleton", async () => {
    await expect(
      getPool().query(`INSERT INTO platform_settings (id, updated_at) VALUES (2, now())`),
    ).rejects.toThrow(/platform_settings_id_check|violates check/);
    await expect(getPool().query(`DELETE FROM platform_settings WHERE id = 1`)).rejects.toThrow(
      /singleton/,
    );
  });
});
