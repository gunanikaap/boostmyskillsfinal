import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { assembleDocuments, certificationRule, type BuilderState } from "@/lib/admin/builder/model";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { getLearnerContent, submitMcqAttempt } from "@/lib/player/service";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const APP_TABLES = [
  "app_users",
  "projects",
  "micro_credentials",
  "credential_versions",
  "micro_programmes",
  "programme_credentials",
  "enrollments",
  "unit_progress",
  "assessment_attempts",
  "certificates",
  "platform_settings",
];

function state(): BuilderState {
  return {
    certification: { thresholdPercent: 50, requiredUnitIds: [] },
    sections: [
      {
        id: "s-1",
        sourceKey: null,
        title: "Sec",
        subsections: [
          {
            id: "ss-1",
            sourceKey: null,
            title: "Sub",
            units: [
              {
                id: "u-r",
                sourceKey: null,
                type: "reading",
                title: "Read",
                required: true,
                data: { html: "<p>read</p>" },
              },
              {
                id: "u-m",
                sourceKey: null,
                type: "mcq",
                title: "Quiz",
                required: true,
                data: {
                  passMark: 50,
                  questions: [
                    {
                      id: "q1",
                      text: "?",
                      points: 1,
                      options: [
                        { id: "oa", text: "A", correct: true },
                        { id: "ob", text: "B", correct: false },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("full vertical database invariants", () => {
  it("holds the 11-table model and per-vertical invariants after enrol+assess+certify", async () => {
    // Exactly the 11 application tables (+ schema_migrations operational table).
    const tablesRes = await getPool().query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const tables = (tablesRes.rows as { tablename: string }[]).map((r) => r.tablename);
    for (const t of APP_TABLES) expect(tables).toContain(t);
    expect(tables.filter((t) => t !== "schema_migrations").sort()).toEqual([...APP_TABLES].sort());

    const admin = await makeUser("admin");
    const project = await makeProject();
    const { credentialId } = await createCredentialWithDraft({
      projectId: project,
      code: `UATMC01-${Math.round(Math.random() * 1e9)}`,
      slug: `uatmc01-${Math.round(Math.random() * 1e9)}`,
      title: "UAT Learning Foundations",
      authorName: "A",
      createdBy: admin,
    });
    const s = state();
    const { content, grading } = assembleDocuments(s);
    await saveDraft({ credentialId, content, grading, certificationRule: certificationRule(s) });
    await publishCredential(credentialId);
    const publishedVersion = (
      await getPool().query(
        `SELECT id FROM credential_versions WHERE credential_id=$1 AND status='published'`,
        [credentialId],
      )
    ).rows[0]!.id;

    const learner = await makeUser("learner");
    await enrolInCredential(learner, credentialId);
    await enrolInCredential(learner, credentialId); // idempotent

    // learner content carries NO grading answers
    const { content: lc } = await getLearnerContent(learner, credentialId);
    expect(JSON.stringify(lc)).not.toMatch(/correctOptionIds/);
    expect(JSON.stringify(lc)).not.toMatch(/"correct"/);

    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: "u-m",
      answers: { q1: ["oa"] },
    });

    // exactly one credential enrolment bound to the exact published revision
    const enr = await getPool().query(
      `SELECT id, credential_version_id FROM enrollments WHERE user_id=$1 AND credential_id=$2`,
      [learner, credentialId],
    );
    expect(enr.rowCount).toBe(1);
    expect(enr.rows[0]!.credential_version_id).toBe(publishedVersion);

    // exactly one attempt, one certificate, singleton settings
    expect(
      (
        await getPool().query(
          `SELECT count(*)::int c FROM assessment_attempts WHERE enrollment_id=$1`,
          [enr.rows[0]!.id],
        )
      ).rows[0]!.c,
    ).toBe(1);
    expect(
      (
        await getPool().query(`SELECT count(*)::int c FROM certificates WHERE enrollment_id=$1`, [
          enr.rows[0]!.id,
        ])
      ).rows[0]!.c,
    ).toBe(1);
    expect(
      (await getPool().query(`SELECT count(*)::int c FROM platform_settings`)).rows[0]!.c,
    ).toBe(1);

    // no learner-facing content column stores correct answers
    const cv = await getPool().query(
      `SELECT content_document FROM credential_versions WHERE id=$1`,
      [publishedVersion],
    );
    expect(JSON.stringify(cv.rows[0]!.content_document)).not.toMatch(/correctOptionIds/);

    // any stored object keys are provider-neutral (no absolute paths / drive letters / file: / localhost)
    const keys = await getPool().query(
      `SELECT banner_object_key AS k FROM credential_versions WHERE banner_object_key IS NOT NULL
       UNION ALL SELECT banner_object_key FROM micro_programmes WHERE banner_object_key IS NOT NULL
       UNION ALL SELECT pdf_object_key FROM certificates WHERE pdf_object_key IS NOT NULL
       UNION ALL SELECT source_metadata->>'archiveObjectKey' FROM credential_versions WHERE source_metadata->>'archiveObjectKey' IS NOT NULL`,
    );
    for (const row of keys.rows as { k: string }[]) {
      expect(row.k).not.toMatch(/^([a-zA-Z]:[\\/]|\/|file:|https?:\/\/localhost)/);
      expect(row.k).not.toMatch(/\\/);
    }
  });
});
