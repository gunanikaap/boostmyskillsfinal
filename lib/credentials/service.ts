import { db, type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { validateDraftForPublish } from "@/lib/content/validate";
import { sanitizeHtml, sanitizeContentDocumentHtml } from "@/lib/content/sanitize";
import { CONTENT_SCHEMA_VERSION, DEFAULT_CERTIFICATION_THRESHOLD } from "@/lib/content/defaults";
import { certificateTemplateSchema } from "@/lib/content/schema";

export class ServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

// --- Projects ---------------------------------------------------------------

export async function createProject(
  input: { name: string; slug: string; organisationName: string; certificateTemplate: unknown },
  conn: Queryable = db,
): Promise<string> {
  const template = certificateTemplateSchema.parse(input.certificateTemplate);
  const { rows } = await conn.query(
    `INSERT INTO projects (name, slug, organisation_name, certificate_template)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.name, input.slug, input.organisationName, JSON.stringify(template)],
  );
  return (rows[0] as { id: string }).id;
}

export async function listProjects(conn: Queryable = db) {
  const { rows } = await conn.query(
    `SELECT id, name, slug, organisation_name FROM projects ORDER BY name`,
  );
  return rows;
}

export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  organisationName: string;
  certificateTemplate: unknown;
}

export async function getProject(id: string, conn: Queryable = db): Promise<ProjectDetail | null> {
  const { rows } = await conn.query(
    `SELECT id, name, slug, organisation_name, certificate_template FROM projects WHERE id = $1`,
    [id],
  );
  const r = rows[0] as
    | {
        id: string;
        name: string;
        slug: string;
        organisation_name: string;
        certificate_template: unknown;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    organisationName: r.organisation_name,
    certificateTemplate: r.certificate_template,
  };
}

/** Update a project's name, organisation and certificate template. Slug is
 * immutable here (it may be referenced elsewhere); the template is re-validated. */
export async function updateProject(
  id: string,
  input: { name: string; organisationName: string; certificateTemplate: unknown },
  conn: Queryable = db,
): Promise<void> {
  const template = certificateTemplateSchema.parse(input.certificateTemplate);
  const res = await conn.query(
    `UPDATE projects SET name = $2, organisation_name = $3, certificate_template = $4 WHERE id = $1`,
    [id, input.name, input.organisationName, JSON.stringify(template)],
  );
  if ((res.rowCount ?? 0) === 0) throw new ServiceError("not_found", "Project not found");
}

// --- Credential creation (stable identity + first draft revision) -----------

const emptyContent = { schemaVersion: CONTENT_SCHEMA_VERSION, sections: [] };
const emptyGrading = { schemaVersion: CONTENT_SCHEMA_VERSION, units: [] };

export async function createCredentialWithDraft(
  input: {
    projectId: string;
    code: string;
    slug: string;
    title: string;
    authorName: string;
    createdBy: string;
    shortDescription?: string;
    aboutHtml?: string;
    topic?: string;
    organisationName?: string;
  },
  conn?: Queryable,
): Promise<{ credentialId: string; versionId: string }> {
  const run = async (tx: Queryable) => {
    const cred = await tx.query(
      `INSERT INTO micro_credentials (project_id, code, slug, status, created_by)
       VALUES ($1,$2,$3,'draft',$4) RETURNING id`,
      [input.projectId, input.code, input.slug, input.createdBy],
    );
    const credentialId = (cred.rows[0] as { id: string }).id;
    const version = await tx.query(
      `INSERT INTO credential_versions
        (credential_id, revision_number, status, schema_version, title, author_name,
         short_description, about_content, content_document, grading_document,
         certification_rule, source_metadata, created_by)
       VALUES ($1,1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        credentialId,
        CONTENT_SCHEMA_VERSION,
        input.title,
        input.authorName,
        input.shortDescription ?? null,
        JSON.stringify({ html: sanitizeHtml(input.aboutHtml ?? "") }),
        JSON.stringify(emptyContent),
        JSON.stringify(emptyGrading),
        JSON.stringify({
          thresholdPercent: DEFAULT_CERTIFICATION_THRESHOLD,
          requiredUnitIds: [],
        }),
        JSON.stringify({
          sourceType: "native",
          ...(input.topic?.trim() ? { topic: input.topic.trim() } : {}),
          ...(input.organisationName?.trim()
            ? { organisation: input.organisationName.trim() }
            : {}),
        }),
        input.createdBy,
      ],
    );
    return { credentialId, versionId: (version.rows[0] as { id: string }).id };
  };
  return conn ? run(conn) : withTransaction(run);
}

/** Update the (single) draft revision. Only a draft is mutable. */
export async function saveDraft(
  input: {
    credentialId: string;
    title?: string;
    authorName?: string;
    shortDescription?: string;
    aboutHtml?: string;
    bannerObjectKey?: string | null;
    content?: unknown;
    grading?: unknown;
    certificationRule?: unknown;
  },
  conn: Queryable = db,
): Promise<void> {
  const { rows } = await conn.query(
    `SELECT id, status FROM credential_versions
     WHERE credential_id = $1 AND status = 'draft'`,
    [input.credentialId],
  );
  const draft = rows[0] as { id: string; status: string } | undefined;
  if (!draft) throw new ServiceError("no_draft", "No editable draft revision exists");

  // Sanitise any HTML that will be persisted: About content and — crucially —
  // every reading unit's HTML inside the content document (the builder saves the
  // whole document here, so this is the ingest point for builder-authored HTML).
  const about = input.aboutHtml !== undefined ? { html: sanitizeHtml(input.aboutHtml) } : undefined;
  const content =
    input.content !== undefined ? sanitizeContentDocumentHtml(input.content) : undefined;

  await conn.query(
    `UPDATE credential_versions SET
       title = COALESCE($2, title),
       author_name = COALESCE($3, author_name),
       short_description = COALESCE($4, short_description),
       about_content = COALESCE($5, about_content),
       banner_object_key = COALESCE($6, banner_object_key),
       content_document = COALESCE($7, content_document),
       grading_document = COALESCE($8, grading_document),
       certification_rule = COALESCE($9, certification_rule)
     WHERE id = $1`,
    [
      draft.id,
      input.title ?? null,
      input.authorName ?? null,
      input.shortDescription ?? null,
      about ? JSON.stringify(about) : null,
      input.bannerObjectKey === undefined ? null : input.bannerObjectKey,
      content !== undefined ? JSON.stringify(content) : null,
      input.grading ? JSON.stringify(input.grading) : null,
      input.certificationRule ? JSON.stringify(input.certificationRule) : null,
    ],
  );
}

/**
 * Update editable credential metadata: the identity fields (code / slug on the
 * micro_credential — useful after an OLX import mangles them) and the
 * version-level meta (title + organisation + topic in source_metadata). Title /
 * organisation / topic are applied to BOTH the draft and the published revision
 * so the catalogue reflects a change without needing a republish.
 */
export async function updateCredentialMeta(
  credentialId: string,
  input: {
    code?: string;
    slug?: string;
    title?: string;
    organisation?: string;
    topic?: string;
  },
  conn?: Queryable,
): Promise<void> {
  const run = async (tx: Queryable) => {
    const idSets: string[] = [];
    const idVals: unknown[] = [credentialId];
    if (input.code !== undefined) {
      const code = input.code.trim();
      if (!code) throw new ServiceError("invalid_code", "Code cannot be empty.");
      idVals.push(code);
      idSets.push(`code = $${idVals.length}`);
    }
    if (input.slug !== undefined) {
      const slug = input.slug.trim();
      if (!slug) throw new ServiceError("invalid_slug", "Slug cannot be empty.");
      idVals.push(slug);
      idSets.push(`slug = $${idVals.length}`);
    }
    if (idSets.length) {
      try {
        await tx.query(`UPDATE micro_credentials SET ${idSets.join(", ")} WHERE id = $1`, idVals);
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          throw new ServiceError(
            "duplicate",
            "That code or slug is already used by another credential.",
          );
        }
        throw err;
      }
    }

    const patch: Record<string, string> = {};
    if (input.organisation !== undefined) patch.organisation = input.organisation.trim();
    if (input.topic !== undefined) patch.topic = input.topic.trim();
    const setTitle = input.title !== undefined;
    if (setTitle || Object.keys(patch).length > 0) {
      await tx.query(
        `UPDATE credential_versions
         SET title = COALESCE($2, title),
             source_metadata = source_metadata || $3::jsonb
         WHERE credential_id = $1 AND status IN ('draft', 'published')`,
        [credentialId, setTitle ? input.title!.trim() : null, JSON.stringify(patch)],
      );
    }
  };
  return conn ? run(conn) : withTransaction(run);
}

/**
 * Publish the current draft. Runs entirely in one transaction:
 *  1. validate the whole draft (ids unique, grading references valid, no answers
 *     in content, certification config valid);
 *  2. retire the previously published revision (if any);
 *  3. publish the draft;
 *  4. set the parent credential to published.
 */
export async function publishCredential(
  credentialId: string,
  conn?: Queryable,
): Promise<{ publishedVersionId: string }> {
  const run = async (tx: Queryable) => {
    const draftRes = await tx.query(
      `SELECT id, content_document, grading_document, certification_rule
       FROM credential_versions
       WHERE credential_id = $1 AND status = 'draft' FOR UPDATE`,
      [credentialId],
    );
    const draft = draftRes.rows[0] as
      | {
          id: string;
          content_document: unknown;
          grading_document: unknown;
          certification_rule: unknown;
        }
      | undefined;
    if (!draft) throw new ServiceError("no_draft", "No draft revision to publish");

    // Throws ContentValidationError on any problem — aborts the transaction.
    validateDraftForPublish({
      content: draft.content_document,
      grading: draft.grading_document,
      certificationRule: draft.certification_rule,
    });

    // Retire the currently published revision, if present.
    await tx.query(
      `UPDATE credential_versions SET status = 'retired'
       WHERE credential_id = $1 AND status = 'published'`,
      [credentialId],
    );
    // Publish the draft.
    await tx.query(
      `UPDATE credential_versions SET status = 'published', published_at = now()
       WHERE id = $1`,
      [draft.id],
    );
    // Parent credential becomes published (unless intentionally hidden — publish
    // is an explicit admin action so we set published here).
    await tx.query(
      `UPDATE micro_credentials SET status = 'published', hidden_at = NULL, hidden_by = NULL
       WHERE id = $1`,
      [credentialId],
    );
    return { publishedVersionId: draft.id };
  };
  return conn ? run(conn) : withTransaction(run);
}

/**
 * Create a new draft revision by copying the current published revision.
 * Stable IDs are preserved for unchanged nodes (a straight copy here); the admin
 * then edits the draft. Fails if a draft already exists (one-draft invariant).
 */
export async function createDraftFromPublished(
  credentialId: string,
  createdBy: string,
  conn?: Queryable,
): Promise<{ versionId: string }> {
  const run = async (tx: Queryable) => {
    const pubRes = await tx.query(
      `SELECT * FROM credential_versions
       WHERE credential_id = $1 AND status = 'published'`,
      [credentialId],
    );
    const pub = pubRes.rows[0] as Record<string, unknown> | undefined;
    if (!pub) throw new ServiceError("no_published", "No published revision to copy");

    const maxRes = await tx.query(
      `SELECT COALESCE(MAX(revision_number),0) AS max FROM credential_versions WHERE credential_id = $1`,
      [credentialId],
    );
    const next = Number((maxRes.rows[0] as { max: number }).max) + 1;

    const ins = await tx.query(
      `INSERT INTO credential_versions
        (credential_id, revision_number, status, schema_version, title, author_name,
         short_description, about_content, banner_object_key, content_document,
         grading_document, certification_rule, source_metadata, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        credentialId,
        next,
        pub.schema_version,
        pub.title,
        pub.author_name,
        pub.short_description,
        JSON.stringify(pub.about_content),
        pub.banner_object_key,
        JSON.stringify(pub.content_document),
        JSON.stringify(pub.grading_document),
        JSON.stringify(pub.certification_rule),
        JSON.stringify(pub.source_metadata),
        createdBy,
      ],
    );
    return { versionId: (ins.rows[0] as { id: string }).id };
  };
  return conn ? run(conn) : withTransaction(run);
}

// --- Hide / unhide ----------------------------------------------------------

export async function hideCredential(credentialId: string, adminId: string, conn: Queryable = db) {
  await conn.query(
    `UPDATE micro_credentials SET status = 'hidden', hidden_at = now(), hidden_by = $2
     WHERE id = $1 AND status != 'draft'`,
    [credentialId, adminId],
  );
}

export async function unhideCredential(credentialId: string, conn: Queryable = db) {
  // Unhide restores to published; enrolments and versions are untouched.
  await conn.query(
    `UPDATE micro_credentials SET status = 'published', hidden_at = NULL, hidden_by = NULL
     WHERE id = $1 AND status = 'hidden'`,
    [credentialId],
  );
}
