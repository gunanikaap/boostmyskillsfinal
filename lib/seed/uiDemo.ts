import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "@/lib/db/pool";
import { appEnv } from "@/lib/env";
import {
  createProject,
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  hideCredential,
} from "@/lib/credentials/service";
import {
  createProgramme,
  setProgrammeCredentials,
  publishProgramme,
  hideProgramme,
} from "@/lib/programmes/service";
import { uploadCredentialBanner, uploadProgrammeBanner } from "@/lib/storage/bannerService";

/**
 * Persistent, idempotent LOCAL demo catalogue for visual/frontend review.
 *
 * Every record is tagged with `external_ref = local-ui-demo:<key>` so re-running
 * updates-in-place instead of duplicating, and non-demo data is never touched.
 * Uses the real service/domain layer (immutable published revisions, programme
 * membership, banner validation, the local storage provider) so what renders is
 * exactly what the product produces. Refuses to run under uat/production.
 */

export const DEMO = "local-ui-demo:";

function guardEnv(): void {
  const env = appEnv();
  if (env === "uat" || env === "production") {
    throw new Error(`db:seed:ui refuses to run under APP_ENV=${env} (local/test only)`);
  }
}

/** A themed sustainability illustration (the site's own owned imagery) as banner bytes. */
function bannerBytes(i: number): Buffer {
  const n = (i % 6) + 1;
  return readFileSync(join(process.cwd(), "public", "brand", "programs", `mp${n}.jpg`));
}

async function findByRef(table: string, ref: string): Promise<string | undefined> {
  const { rows } = await getPool().query(`SELECT id FROM ${table} WHERE external_ref = $1`, [ref]);
  return (rows[0] as { id: string } | undefined)?.id;
}
async function tagRef(table: string, id: string, ref: string): Promise<void> {
  await getPool().query(`UPDATE ${table} SET external_ref = $2 WHERE id = $1`, [id, ref]);
}
/** Merge a topic into every version's source_metadata (idempotent backfill). */
async function setCredentialTopic(credentialId: string, topic: string): Promise<void> {
  await getPool().query(
    `UPDATE credential_versions
     SET source_metadata = COALESCE(source_metadata, '{}'::jsonb) || jsonb_build_object('topic', $2::text)
     WHERE credential_id = $1`,
    [credentialId, topic],
  );
}

/** A local demo admin used as created_by. Never touches a real admin. */
async function ensureDemoAdmin(): Promise<string> {
  const pool = getPool();
  const existing = await pool.query(
    `SELECT id FROM app_users WHERE role='admin' ORDER BY created_at LIMIT 1`,
  );
  if (existing.rows[0]) return (existing.rows[0] as { id: string }).id;
  const { rows } = await pool.query(
    `INSERT INTO app_users (clerk_user_id, email, first_name, last_name, role, external_ref)
     VALUES ($1,$2,'Demo','Admin','admin',$3)
     ON CONFLICT (clerk_user_id) DO UPDATE SET role='admin'
     RETURNING id`,
    ["local-ui-demo-admin", "local-ui-demo-admin@example.test", `${DEMO}admin`],
  );
  return (rows[0] as { id: string }).id;
}

// --- Content generator (valid against the publish validator) -----------------

function buildContent(code: string, topic: string) {
  const p = code.toLowerCase();
  const html =
    `<p>This micro-credential introduces the key ideas behind ${topic}. ` +
    `You will explore core concepts, why they matter for a sustainable transition, and how ` +
    `they apply in real European cities and organisations.</p>` +
    `<p>Work through the reading and short video, then complete the knowledge check to earn ` +
    `your verifiable certificate.</p>`;
  const content = {
    schemaVersion: 1,
    sections: [
      {
        id: `${p}-s1`,
        sourceKey: null,
        title: "Introduction",
        subsections: [
          {
            id: `${p}-ss1`,
            sourceKey: null,
            title: "Core concepts",
            units: [
              {
                id: `${p}-u1`,
                sourceKey: null,
                type: "reading" as const,
                title: `Overview of ${topic}`,
                required: true,
                data: { html },
              },
              {
                id: `${p}-u2`,
                sourceKey: null,
                type: "video" as const,
                title: "Watch: a short introduction",
                required: false,
                data: { youtubeId: "dQw4w9WgXcQ" },
              },
            ],
          },
          {
            id: `${p}-ss2`,
            sourceKey: null,
            title: "Knowledge check",
            units: [
              {
                id: `${p}-u3`,
                sourceKey: null,
                type: "mcq" as const,
                title: "Knowledge check",
                required: true,
                data: {
                  passMark: 50,
                  questions: [
                    {
                      id: `${p}-q1`,
                      text: `Which best describes the focus of ${topic}?`,
                      options: [
                        { id: `${p}-q1a`, text: "Advancing the sustainable transition" },
                        { id: `${p}-q1b`, text: "Maximising short-term profit only" },
                        { id: `${p}-q1c`, text: "Avoiding measurement of impact" },
                      ],
                    },
                    {
                      id: `${p}-q2`,
                      text: "Sustainability decisions should be based on:",
                      options: [
                        { id: `${p}-q2a`, text: "Evidence and measured outcomes" },
                        { id: `${p}-q2b`, text: "Guesswork" },
                        { id: `${p}-q2c`, text: "Ignoring emissions" },
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
  const grading = {
    schemaVersion: 1,
    units: [
      {
        unitId: `${p}-u3`,
        passMark: 50,
        maxAttempts: 1,
        questions: [
          { questionId: `${p}-q1`, correctOptionIds: [`${p}-q1a`], points: 1 },
          { questionId: `${p}-q2`, correctOptionIds: [`${p}-q2a`], points: 1 },
        ],
      },
    ],
  };
  const certificationRule = { thresholdPercent: 50, requiredUnitIds: [`${p}-u1`] };
  return { content, grading, certificationRule };
}

// --- Demo definitions --------------------------------------------------------

interface CredDef {
  code: string;
  slug: string;
  title: string;
  topic: string;
  short: string;
}

const CREDENTIALS: CredDef[] = [
  {
    code: "MC01",
    slug: "fundamentals-of-energy-systems",
    title: "Fundamentals of Energy Systems",
    topic: "energy systems",
    short: "Understand how modern energy systems are generated, distributed and balanced.",
  },
  {
    code: "MC02",
    slug: "introduction-to-renewable-energies",
    title: "Introduction to Renewable Energies",
    topic: "renewable energy",
    short: "Explore solar, wind and other renewables and their role in decarbonisation.",
  },
  {
    code: "MC03",
    slug: "introduction-to-sustainable-finance",
    title: "Introduction to Sustainable Finance",
    topic: "sustainable finance",
    short: "Learn how finance drives the green transition through ESG and green investment.",
  },
  {
    code: "MC04",
    slug: "data-analytics-for-the-energy-sector",
    title: "Data Analytics for the Energy Sector",
    topic: "energy data analytics",
    short: "Use data to understand demand, efficiency and emissions in the energy sector.",
  },
  {
    code: "MC05",
    slug: "efficient-building-techniques",
    title: "Efficient Building Techniques",
    topic: "efficient buildings",
    short: "Design and retrofit buildings for lower energy use and carbon.",
  },
  {
    code: "MC06",
    slug: "tools-for-city-decarbonisation",
    title: "Tools for City Decarbonisation",
    topic: "city decarbonisation",
    short: "Practical tools and strategies to cut emissions across a city.",
  },
  {
    code: "MC07",
    slug: "energy-utilisation-and-storage",
    title: "Energy Utilisation and Storage",
    topic: "energy storage",
    short: "How energy is stored and used efficiently across the grid.",
  },
  {
    code: "MC08",
    slug: "case-studies-in-energy-management",
    title: "Case Studies in Energy Management",
    topic: "energy management",
    short: "Real-world case studies in managing energy sustainably.",
  },
];

interface ProgDef {
  slug: string;
  title: string;
  short: string;
  members: string[]; // credential codes
}

const PROGRAMMES: ProgDef[] = [
  {
    slug: "sustainable-energy-technologies-urban-environments",
    title: "Sustainable Energy Technologies and Strategies in Urban Environments",
    short: "A pathway through the technologies powering sustainable cities.",
    members: ["MC01", "MC02", "MC07"],
  },
  {
    slug: "decarbonization-strategies-social-innovation-cities",
    title: "Decarbonization Strategies and Social Innovation for Cities and Communities",
    short: "Strategies and innovation to decarbonise communities.",
    members: ["MC06", "MC03", "MC08"],
  },
  {
    slug: "advanced-design-of-sustainable-cities",
    title: "Advanced Design of Sustainable Cities",
    short: "Advanced design for low-carbon, liveable cities.",
    members: ["MC05", "MC04", "MC06"],
  },
];

const ISSUER_TEMPLATE = {
  issuerName: "RES4CITY",
  signatoryName: "Programme Director",
  signatoryRole: "Director, RES4CITY",
};

// --- Seed --------------------------------------------------------------------

async function seedCredential(
  admin: string,
  projectId: string,
  def: CredDef,
  i: number,
  opts: { publish: boolean; hide?: boolean },
): Promise<string> {
  const ref = `${DEMO}${def.code}`;
  const existing = await findByRef("micro_credentials", ref);
  if (existing) {
    // Idempotent backfill: ensure the topic is present on already-seeded rows.
    await setCredentialTopic(existing, def.topic);
    return existing;
  }
  const { credentialId } = await createCredentialWithDraft({
    projectId,
    code: def.code,
    slug: def.slug,
    title: def.title,
    authorName: "RES4CITY Faculty",
    shortDescription: def.short,
    aboutHtml: `<p>${def.short}</p><p>Delivered by RES4CITY and partner universities as part of the BoostMySkills catalogue.</p>`,
    topic: def.topic,
    createdBy: admin,
  });
  const { content, grading, certificationRule } = buildContent(def.code, def.topic);
  await saveDraft({ credentialId, content, grading, certificationRule });
  await uploadCredentialBanner(credentialId, bannerBytes(i));
  if (opts.publish) await publishCredential(credentialId);
  if (opts.hide) await hideCredential(credentialId, admin);
  await tagRef("micro_credentials", credentialId, ref);
  return credentialId;
}

async function seedProgramme(
  admin: string,
  projectId: string,
  def: ProgDef,
  codeToId: Map<string, string>,
  i: number,
  opts: { publish: boolean; hide?: boolean },
): Promise<void> {
  const ref = `${DEMO}${def.slug}`;
  if (await findByRef("micro_programmes", ref)) return;
  const programmeId = await createProgramme({
    projectId,
    slug: def.slug,
    title: def.title,
    shortDescription: def.short,
    aboutHtml: `<p>${def.short}</p><p>This micro-programme bundles several micro-credentials into a coherent learning path with an aggregate completion.</p>`,
    createdBy: admin,
  });
  const items = def.members
    .map((code, pos) => {
      const id = codeToId.get(code);
      return id ? { credentialId: id, position: pos + 1, isRequired: true } : null;
    })
    .filter(
      (x): x is { credentialId: string; position: number; isRequired: boolean } => x !== null,
    );
  await setProgrammeCredentials(programmeId, items);
  await uploadProgrammeBanner(programmeId, bannerBytes(i));
  if (opts.publish) await publishProgramme(programmeId);
  if (opts.hide) await hideProgramme(programmeId);
  await tagRef("micro_programmes", programmeId, ref);
}

export interface SeedSummary {
  projectId: string;
  publishedCredentials: number;
  publishedProgrammes: number;
  draftCredential: string;
  hiddenCredential: string;
  draftProgramme: string;
  hiddenProgramme: string;
}

export async function seedUiDemo(): Promise<SeedSummary> {
  guardEnv();
  const admin = await ensureDemoAdmin();

  // Project (idempotent by slug — projects have no external_ref column).
  const projSlug = "res4city";
  let projectId = (await getPool().query(`SELECT id FROM projects WHERE slug = $1`, [projSlug]))
    .rows[0]?.id as string | undefined;
  if (!projectId) {
    projectId = await createProject({
      name: "RES4CITY",
      slug: projSlug,
      organisationName: "RES4CITY",
      certificateTemplate: ISSUER_TEMPLATE,
    });
  }

  // Eight published credentials.
  const codeToId = new Map<string, string>();
  for (let i = 0; i < CREDENTIALS.length; i++) {
    const id = await seedCredential(admin, projectId, CREDENTIALS[i]!, i, { publish: true });
    codeToId.set(CREDENTIALS[i]!.code, id);
  }

  // Three published programmes.
  for (let i = 0; i < PROGRAMMES.length; i++) {
    await seedProgramme(admin, projectId, PROGRAMMES[i]!, codeToId, i, { publish: true });
  }

  // Visibility fixtures (must NOT appear publicly).
  const draftCred = await seedCredential(
    admin,
    projectId,
    {
      code: "MC90",
      slug: "draft-preview-credential",
      title: "Draft Preview Credential",
      topic: "draft content",
      short: "A draft credential for visibility checks.",
    },
    0,
    { publish: false },
  );
  const hiddenCred = await seedCredential(
    admin,
    projectId,
    {
      code: "MC91",
      slug: "hidden-preview-credential",
      title: "Hidden Preview Credential",
      topic: "hidden content",
      short: "A hidden credential for visibility checks.",
    },
    1,
    { publish: true, hide: true },
  );
  await seedProgramme(
    admin,
    projectId,
    {
      slug: "draft-preview-programme",
      title: "Draft Preview Programme",
      short: "A draft programme for visibility checks.",
      members: ["MC01", "MC02"],
    },
    codeToId,
    2,
    { publish: false },
  );
  await seedProgramme(
    admin,
    projectId,
    {
      slug: "hidden-preview-programme",
      title: "Hidden Preview Programme",
      short: "A hidden programme for visibility checks.",
      members: ["MC01", "MC02"],
    },
    codeToId,
    3,
    { publish: true, hide: true },
  );

  // Ensure maintenance stays off.
  await getPool().query(`UPDATE platform_settings SET maintenance_mode = false WHERE id = 1`);

  const count = async (sql: string): Promise<number> =>
    Number((await getPool().query(sql)).rows[0]!.n);
  return {
    projectId,
    publishedCredentials: await count(
      `SELECT count(*)::int n FROM micro_credentials WHERE status='published' AND external_ref LIKE '${DEMO}%'`,
    ),
    publishedProgrammes: await count(
      `SELECT count(*)::int n FROM micro_programmes WHERE status='published' AND external_ref LIKE '${DEMO}%'`,
    ),
    draftCredential: draftCred,
    hiddenCredential: hiddenCred,
    draftProgramme: `${DEMO}draft-preview-programme`,
    hiddenProgramme: `${DEMO}hidden-preview-programme`,
  };
}
