import { getPool } from "@/lib/db/pool";

let seq = 0;
const uniq = () => `${Date.now().toString(36)}-${seq++}`;

export async function makeUser(role: "learner" | "admin" = "learner"): Promise<string> {
  const u = uniq();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO app_users (clerk_user_id, email, role) VALUES ($1,$2,$3) RETURNING id`,
    [`clerk_${u}`, `user_${u}@example.com`, role],
  );
  return rows[0]!.id;
}

export async function makeProject(): Promise<string> {
  const u = uniq();
  const template = {
    issuerName: "RES4CITY",
    logoObjectKey: null,
    backgroundObjectKey: null,
    signatoryName: "Programme Director",
    signatoryRole: "Director",
  };
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO projects (name, slug, organisation_name, certificate_template)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [`Project ${u}`, `project-${u}`, `Org ${u}`, JSON.stringify(template)],
  );
  return rows[0]!.id;
}

export async function makeCredential(
  projectId: string,
  status: "draft" | "published" | "hidden" = "draft",
): Promise<string> {
  const u = uniq();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO micro_credentials (project_id, code, slug, status)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [projectId, `MC-${u}`, `mc-${u}`, status],
  );
  return rows[0]!.id;
}

export async function makeProgramme(
  projectId: string,
  status: "draft" | "published" | "hidden" = "published",
): Promise<string> {
  const u = uniq();
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO micro_programmes (project_id, slug, title, about_content, status, published_at)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $5='published' THEN now() ELSE NULL END) RETURNING id`,
    [projectId, `mp-${u}`, `Programme ${u}`, JSON.stringify({ html: "<p>About</p>" }), status],
  );
  return rows[0]!.id;
}

/** A minimal valid content document with one MCQ unit + matching grading. */
export function sampleContent(unitId = "u-mcq-1", qId = "q1", optA = "oa", optB = "ob") {
  return {
    content: {
      schemaVersion: 1,
      sections: [
        {
          id: "s1",
          sourceKey: null,
          title: "Section 1",
          subsections: [
            {
              id: "ss1",
              sourceKey: null,
              title: "Subsection 1",
              units: [
                {
                  id: unitId,
                  sourceKey: null,
                  type: "mcq",
                  title: "Quiz",
                  required: true,
                  data: {
                    passMark: 50,
                    questions: [
                      {
                        id: qId,
                        text: "2 + 2 = ?",
                        options: [
                          { id: optA, text: "4" },
                          { id: optB, text: "5" },
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
    },
    grading: {
      schemaVersion: 1,
      units: [
        {
          unitId,
          passMark: 50,
          maxAttempts: 1,
          questions: [{ questionId: qId, correctOptionIds: [optA], points: 1 }],
        },
      ],
    },
    certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
  };
}
