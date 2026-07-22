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
import { sanitizeHtml } from "@/lib/content/sanitize";

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
/**
 * OLX-style section outline per credential — the chapter display_names shown in
 * the detail-page "Sections" list (ending in "Final Exam"), mirroring how the
 * live Open edX courses are structured. Count varies per credential.
 */
const CHAPTERS: Record<string, string[]> = {
  MC01: [
    "Foundations of Energy Systems",
    "Generation, Transmission and Distribution",
    "Balancing Supply and Demand",
    "The Grid in the Low-Carbon Transition",
    "Final Exam",
  ],
  MC02: [
    "The Renewable Energy Landscape",
    "Solar and Wind Technologies",
    "Integrating Renewables into the Grid",
    "Barriers and Enablers",
    "Final Exam",
  ],
  MC03: [
    "Foundations of Sustainable Finance",
    "ESG Principles and Reporting",
    "Green Financial Instruments",
    "Financing the Transition",
    "Final Exam",
  ],
  MC04: [
    "Data in the Energy Sector",
    "Analysing Demand and Efficiency",
    "Emissions and Consumption Analytics",
    "From Insight to Decision",
    "Final Exam",
  ],
  // Matches the live "Efficient Building Techniques" (MC18) section list.
  MC05: [
    "Study of the thermal performance of buildings",
    "Basic principles of sustainable building",
    "Minimum energy consumption standards — Passivhaus",
    "Infrared thermography in building construction",
    "Infiltrations and Blower Door testing",
    "Building modelling and simulation",
    "Final Exam",
  ],
  MC06: [
    "Understanding Urban Emissions",
    "Decarbonisation Pathways",
    "Sectoral Interventions",
    "Planning and Implementation",
    "Final Exam",
  ],
  MC07: [
    "Fundamentals of Energy Storage",
    "Storage Technologies Compared",
    "Storage in a Flexible Grid",
    "Final Exam",
  ],
  MC08: [
    "Introduction to Energy Management",
    "Case Study: Industry",
    "Case Study: Cities",
    "Best Practices and Lessons Learned",
    "Final Exam",
  ],
};

/** Effort/duration line shown in the detail sidebar (mirrors the live "Up to …"). */
const DURATION: Record<string, string> = {
  MC01: "Up to 12 hrs per week for 5 weeks",
  MC02: "Up to 10 hrs per week for 4 weeks",
  MC03: "Up to 12 hrs per week for 5 weeks",
  MC04: "Up to 15 hrs per week for 5 weeks",
  MC05: "Up to 15 hrs per week for 5 weeks",
  MC06: "Up to 12 hrs per week for 4 weeks",
  MC07: "Up to 10 hrs per week for 4 weeks",
  MC08: "Up to 12 hrs per week for 5 weeks",
};

/** Total estimated study time (≈ hrs/week × weeks). */
const STUDY_TIME: Record<string, string> = {
  MC01: "Around 60 hours total",
  MC02: "Around 40 hours total",
  MC03: "Around 60 hours total",
  MC04: "Around 75 hours total",
  MC05: "Around 75 hours total",
  MC06: "Around 48 hours total",
  MC07: "Around 40 hours total",
  MC08: "Around 60 hours total",
};

/** Merge topic + sections + duration + study time into source_metadata (idempotent). */
async function setCredentialMeta(credentialId: string, code: string, topic: string): Promise<void> {
  await getPool().query(
    `UPDATE credential_versions
     SET source_metadata = COALESCE(source_metadata, '{}'::jsonb) || $2::jsonb
     WHERE credential_id = $1`,
    [
      credentialId,
      JSON.stringify({
        topic,
        chapters: CHAPTERS[code] ?? [],
        duration: DURATION[code] ?? "Self-paced, fully online",
        studyTime: STUDY_TIME[code] ?? "",
      }),
    ],
  );
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Idempotently ensure ONE project row per funded project (keyed by name), so a
 * funded project such as RES4CITY appears exactly once everywhere it's listed
 * (admin project pickers, catalogue Project facet, analytics). The organisation
 * is taken from the first credential that introduces the project; RES4CITY is
 * created up front (organisation "RES4CITY") and reused by all its credentials.
 */
async function ensureProject(name: string, org: string): Promise<string> {
  const found = (
    await getPool().query(`SELECT id FROM projects WHERE name = $1 ORDER BY created_at LIMIT 1`, [
      name,
    ])
  ).rows[0]?.id as string | undefined;
  if (found) return found;
  return createProject({
    name,
    slug: slugify(name),
    organisationName: org,
    certificateTemplate: {
      issuerName: name,
      signatoryName: "Programme Director",
      signatoryRole: `Director, ${name}`,
    },
  });
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

// --- About content (varying number of titled blocks per credential) ----------
// Some credentials carry a "Background" block (3 headings), some don't (2) — the
// detail page renders whatever headings the sanitised HTML contains.
const ABOUT: Record<string, { objectives: string[]; background?: string }> = {
  MC01: {
    objectives: [
      "Explain how modern energy systems generate, transmit and distribute power",
      "Describe how supply and demand are balanced across the grid",
      "Identify the role of energy systems in the low-carbon transition",
    ],
    background: "A basic understanding of physics and mathematics at EQF level 4–5 is recommended.",
  },
  MC02: {
    objectives: [
      "Compare the main renewable energy sources and their applications",
      "Assess the role of renewables in decarbonisation",
      "Recognise the barriers to, and enablers of, renewable deployment",
    ],
  },
  MC03: {
    objectives: [
      "Explain the principles of ESG and sustainable investment",
      "Interpret how green finance drives the transition",
      "Identify sustainable financial instruments and their uses",
    ],
    background: "No prior finance knowledge is required, though basic economics is helpful.",
  },
  MC04: {
    objectives: [
      "Apply data analysis to energy demand and efficiency",
      "Interpret emissions and consumption data",
      "Use data insights to support energy decision-making",
    ],
  },
  MC05: {
    objectives: [
      "Diagnose the thermal performance of a building",
      "Design buildings for minimum energy consumption",
      "Apply sustainable retrofit and construction techniques",
    ],
    background: "Basics in mathematics and physics at EQF 4–5 level are recommended.",
  },
  MC06: {
    objectives: [
      "Select tools and strategies to reduce city-wide emissions",
      "Evaluate decarbonisation pathways for urban areas",
      "Plan practical interventions across sectors",
    ],
  },
  MC07: {
    objectives: [
      "Explain how energy is stored and released across the grid",
      "Compare storage technologies and their trade-offs",
      "Assess the role of storage in a flexible energy system",
    ],
    background: "A basic understanding of energy systems is recommended before starting.",
  },
  MC08: {
    objectives: [
      "Analyse real-world energy-management case studies",
      "Identify best practices in sustainable energy use",
      "Translate lessons learned into your own context",
    ],
  },
};

function buildAbout(def: CredDef): string {
  const extra = ABOUT[def.code] ?? { objectives: [] };
  const parts = [
    `<h2>Context and overview</h2>`,
    `<p>This micro-credential introduces the key ideas behind ${def.topic}. ${def.short} ` +
      `You will explore core concepts, why they matter for a sustainable transition, and how ` +
      `they apply in real European cities and organisations.</p>`,
  ];
  if (extra.objectives.length) {
    parts.push(
      `<h2>Learning objectives</h2>`,
      `<p>By the end of this micro-credential, you will be able to:</p>`,
      `<ul>${extra.objectives.map((o) => `<li>${o}</li>`).join("")}</ul>`,
    );
  }
  if (extra.background) {
    parts.push(`<h2>Background</h2>`, `<p>${extra.background}</p>`);
  }
  parts.push(
    `<p>Delivered by ${def.project} and partner universities as part of the BoostMySkills catalogue.</p>`,
  );
  return parts.join("");
}

/** Overwrite about_content on every version (idempotent backfill). */
async function setCredentialAbout(credentialId: string, html: string): Promise<void> {
  await getPool().query(
    `UPDATE credential_versions SET about_content = $2::jsonb WHERE credential_id = $1`,
    [credentialId, JSON.stringify({ html: sanitizeHtml(html) })],
  );
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
  /** Funded project this credential belongs to (Project facet). */
  project: string;
  /** Delivering partner organisation (Organisation facet). */
  org: string;
}

const CREDENTIALS: CredDef[] = [
  {
    code: "MC01",
    slug: "fundamentals-of-energy-systems",
    title: "Fundamentals of Energy Systems",
    topic: "energy systems",
    short: "Understand how modern energy systems are generated, distributed and balanced.",
    project: "RES4CITY",
    org: "Universitat Politècnica de València",
  },
  {
    code: "MC02",
    slug: "introduction-to-renewable-energies",
    title: "Introduction to Renewable Energies",
    topic: "renewable energy",
    short: "Explore solar, wind and other renewables and their role in decarbonisation.",
    project: "RES4CITY",
    org: "National University of Ireland Maynooth",
  },
  {
    code: "MC03",
    slug: "introduction-to-sustainable-finance",
    title: "Introduction to Sustainable Finance",
    topic: "sustainable finance",
    short: "Learn how finance drives the green transition through ESG and green investment.",
    project: "SHERLOCK",
    org: "University of Coimbra",
  },
  {
    code: "MC04",
    slug: "data-analytics-for-the-energy-sector",
    title: "Data Analytics for the Energy Sector",
    topic: "energy data analytics",
    short: "Use data to understand demand, efficiency and emissions in the energy sector.",
    project: "RES4CITY",
    org: "Technical University of Denmark",
  },
  {
    code: "MC05",
    slug: "efficient-building-techniques",
    title: "Efficient Building Techniques",
    topic: "efficient buildings",
    short: "Design and retrofit buildings for lower energy use and carbon.",
    project: "RES4CITY",
    org: "Universitat Politècnica de València",
  },
  {
    code: "MC06",
    slug: "tools-for-city-decarbonisation",
    title: "Tools for City Decarbonisation",
    topic: "city decarbonisation",
    short: "Practical tools and strategies to cut emissions across a city.",
    project: "RESSKILL",
    org: "Halmstad University",
  },
  {
    code: "MC07",
    slug: "energy-utilisation-and-storage",
    title: "Energy Utilisation and Storage",
    topic: "energy storage",
    short: "How energy is stored and used efficiently across the grid.",
    project: "STREACS",
    org: "Université Grenoble Alpes",
  },
  {
    code: "MC08",
    slug: "case-studies-in-energy-management",
    title: "Case Studies in Energy Management",
    topic: "energy management",
    short: "Real-world case studies in managing energy sustainably.",
    project: "COSS",
    org: "Università degli studi di Sassari",
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
  let credentialId = await findByRef("micro_credentials", ref);
  if (!credentialId) {
    const created = await createCredentialWithDraft({
      projectId,
      code: def.code,
      slug: def.slug,
      title: def.title,
      authorName: "RES4CITY Faculty",
      shortDescription: def.short,
      aboutHtml: buildAbout(def),
      topic: def.topic,
      createdBy: admin,
    });
    credentialId = created.credentialId;
    const { content, grading, certificationRule } = buildContent(def.code, def.topic);
    await saveDraft({ credentialId, content, grading, certificationRule });
    await uploadCredentialBanner(credentialId, bannerBytes(i));
    if (opts.publish) await publishCredential(credentialId);
    if (opts.hide) await hideCredential(credentialId, admin);
    await tagRef("micro_credentials", credentialId, ref);
  }
  // Idempotent backfill (new + existing): keep project, about and OLX-style
  // metadata (topic + section outline) current on every re-seed.
  await getPool().query(`UPDATE micro_credentials SET project_id = $2 WHERE id = $1`, [
    credentialId,
    projectId,
  ]);
  await setCredentialAbout(credentialId, buildAbout(def));
  await setCredentialMeta(credentialId, def.code, def.topic);
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
    const def = CREDENTIALS[i]!;
    // Each credential lives under its own funded-project + partner-organisation.
    const credProjectId = await ensureProject(def.project, def.org);
    const id = await seedCredential(admin, credProjectId, def, i, { publish: true });
    codeToId.set(def.code, id);
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
      project: "RES4CITY",
      org: "RES4CITY",
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
      project: "RES4CITY",
      org: "RES4CITY",
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
