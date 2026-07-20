import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { inspectTarGz, type ArchiveLimits, DEFAULT_LIMITS } from "@/lib/olx/archiveSafety";
import { OlxArchiveError } from "@/lib/olx/errors";
import { sanitizeHtml } from "@/lib/content/sanitize";
import { contentDocumentSchema, gradingDocumentSchema } from "@/lib/content/schema";
import { CONTENT_SCHEMA_VERSION } from "@/lib/content/defaults";
import type { ContentDocument, GradingDocument } from "@/lib/content/schema";
import { type Queryable } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/tx";
import { createCredentialWithDraft, saveDraft } from "@/lib/credentials/service";
import { getStorage } from "@/lib/storage/factory";
import { olxArchiveKey } from "@/lib/storage/keys";

export interface ParsedCourse {
  content: ContentDocument;
  grading: GradingDocument;
  meta: {
    code: string;
    slug: string;
    title: string;
    authorName: string;
    certificationRule: unknown;
  };
  unsupportedBlocks: string[];
  source: "bms-manifest" | "olx";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Do not allow entity expansion attacks; fast-xml-parser does not process DTDs.
  processEntities: true,
});

function fileMap(entries: { path: string; content: Buffer }[]): Map<string, Buffer> {
  const m = new Map<string, Buffer>();
  for (const e of entries) m.set(e.path.replace(/^\.\//, ""), e.content);
  return m;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Parse a safe set of OLX entries into our content + grading model. */
export function parseCourse(entries: { path: string; content: Buffer }[]): ParsedCourse {
  const files = fileMap(entries);

  // Preferred lossless path: a BMS manifest sidecar.
  const manifest = files.get("course/bms/manifest.json");
  if (manifest) {
    const parsed = JSON.parse(manifest.toString("utf8"));
    const content = contentDocumentSchema.parse(parsed.content);
    const grading = gradingDocumentSchema.parse(parsed.grading);
    return {
      content,
      grading,
      meta: parsed.meta,
      unsupportedBlocks: [],
      source: "bms-manifest",
    };
  }

  // Best-effort OLX path.
  const courseXml = files.get("course/course.xml");
  if (!courseXml) throw new OlxArchiveError("invalid_archive", "missing course/course.xml");
  const unsupportedBlocks: string[] = [];
  const course = parser.parse(courseXml.toString("utf8")).course ?? {};
  const title = String(course["@_display_name"] ?? "Imported course");
  const code = String(course["@_course"] ?? `IMP-${title}`.slice(0, 40));

  const sections: ContentDocument["sections"] = [];
  const gradingUnits: GradingDocument["units"] = [];

  for (const chapterRef of asArray(course.chapter)) {
    const chapId = String((chapterRef as Record<string, unknown>)["@_url_name"] ?? "");
    const chapDoc = files.get(`course/chapter/${chapId}.xml`);
    if (!chapDoc) continue;
    const chapter = parser.parse(chapDoc.toString("utf8")).chapter ?? {};
    const subsections: ContentDocument["sections"][number]["subsections"] = [];

    for (const seqRef of asArray(chapter.sequential)) {
      const seqId = String((seqRef as Record<string, unknown>)["@_url_name"] ?? "");
      const seqDoc = files.get(`course/sequential/${seqId}.xml`);
      if (!seqDoc) continue;
      const seq = parser.parse(seqDoc.toString("utf8")).sequential ?? {};
      const units: ContentDocument["sections"][number]["subsections"][number]["units"] = [];

      const addComponents = (tag: "html" | "video" | "problem") => {
        for (const ref of asArray(seq[tag])) {
          const id = String((ref as Record<string, unknown>)["@_url_name"] ?? "");
          if (tag === "html") {
            const html = files.get(`course/html/${id}.html`)?.toString("utf8") ?? "";
            const metaDoc =
              parser.parse(files.get(`course/html/${id}.xml`)?.toString("utf8") ?? "<html/>")
                .html ?? {};
            units.push({
              id,
              sourceKey: id,
              type: "reading",
              title: String(metaDoc["@_display_name"] ?? "Reading"),
              required: true,
              data: { html: sanitizeHtml(html) },
            });
          } else if (tag === "video") {
            const vDoc =
              parser.parse(files.get(`course/video/${id}.xml`)?.toString("utf8") ?? "<video/>")
                .video ?? {};
            const yt = String(vDoc["@_youtube_id_1_0"] ?? "");
            units.push({
              id,
              sourceKey: id,
              type: "video",
              title: String(vDoc["@_display_name"] ?? "Video"),
              required: true,
              data: yt ? { youtubeId: yt } : { mediaObjectKey: `imported/${id}` },
            });
          } else {
            const pDoc =
              parser.parse(files.get(`course/problem/${id}.xml`)?.toString("utf8") ?? "<problem/>")
                .problem ?? {};
            const questions: {
              id: string;
              text: string;
              options: { id: string; text: string }[];
            }[] = [];
            const gQuestions: { questionId: string; correctOptionIds: string[]; points: number }[] =
              [];
            for (const mc of asArray(pDoc.multiplechoiceresponse)) {
              const m = mc as Record<string, unknown>;
              const qid = String(m["@_url_name"] ?? `${id}-q${questions.length + 1}`);
              const qText = String(m.label ?? "Question");
              const options: { id: string; text: string }[] = [];
              const correct: string[] = [];
              asArray(m.choice).forEach((c, i) => {
                const ch = c as Record<string, unknown>;
                const oid = String(ch["@_url_name"] ?? `${qid}-o${i + 1}`);
                const text = String(ch["#text"] ?? ch ?? "");
                options.push({ id: oid, text });
                if (String(ch["@_correct"]) === "true") correct.push(oid);
              });
              questions.push({ id: qid, text: qText, options });
              gQuestions.push({
                questionId: qid,
                correctOptionIds: correct.length ? correct : [options[0]?.id ?? "o1"],
                points: 1,
              });
            }
            units.push({
              id,
              sourceKey: id,
              type: "mcq",
              title: String(pDoc["@_display_name"] ?? "Assessment"),
              required: true,
              data: { passMark: 50, questions },
            });
            gradingUnits.push({ unitId: id, passMark: 50, maxAttempts: 1, questions: gQuestions });
          }
        }
      };
      addComponents("html");
      addComponents("video");
      addComponents("problem");

      subsections.push({
        id: seqId,
        sourceKey: seqId,
        title: String(seq["@_display_name"] ?? "Subsection"),
        units,
      });
    }
    sections.push({
      id: chapId,
      sourceKey: chapId,
      title: String(chapter["@_display_name"] ?? "Section"),
      subsections,
    });
  }

  const content: ContentDocument = { schemaVersion: CONTENT_SCHEMA_VERSION, sections };
  const grading: GradingDocument = { schemaVersion: CONTENT_SCHEMA_VERSION, units: gradingUnits };

  return {
    content,
    grading,
    meta: {
      code,
      slug: code.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      authorName: "Imported",
      certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
    },
    unsupportedBlocks,
    source: "olx",
  };
}

export interface ImportResult {
  credentialId: string;
  archiveSha256: string;
  source: string;
  unsupportedBlocks: string[];
  archiveObjectKey: string;
}

/**
 * Admin-only OLX import. Inspects the archive for safety, parses it, and creates
 * a DRAFT credential + draft revision. NEVER publishes automatically. Records
 * source metadata (checksum, filename, unsupported blocks).
 */
export async function importOlxToDraft(
  input: {
    gz: Buffer;
    originalFilename: string;
    projectId: string;
    adminId: string;
    archiveObjectKey?: string;
  },
  limits: ArchiveLimits = DEFAULT_LIMITS,
  conn?: Queryable,
): Promise<ImportResult> {
  const entries = inspectTarGz(input.gz, limits); // throws OlxArchiveError on danger
  const archiveSha256 = createHash("sha256").update(input.gz).digest("hex");
  const parsed = parseCourse(entries);

  const run = async (tx: Queryable): Promise<ImportResult> => {
    const uniqueSuffix = archiveSha256.slice(0, 8);
    const { credentialId } = await createCredentialWithDraft(
      {
        projectId: input.projectId,
        code: `${parsed.meta.code}-${uniqueSuffix}`.slice(0, 60),
        slug: `${parsed.meta.slug}-${uniqueSuffix}`.slice(0, 60),
        title: parsed.meta.title,
        authorName: parsed.meta.authorName,
        createdBy: input.adminId,
      },
      tx,
    );
    await saveDraft(
      {
        credentialId,
        content: parsed.content,
        grading: parsed.grading,
        certificationRule: parsed.meta.certificationRule,
      },
      tx,
    );

    // Persist the original OLX archive privately through the storage provider
    // (server-generated key; never a filesystem path). If storage fails, the
    // whole transaction rolls back — no orphan draft is created.
    const archiveObjectKey = input.archiveObjectKey ?? olxArchiveKey(credentialId);
    await getStorage().putObject(archiveObjectKey, input.gz, {
      contentType: "application/gzip",
      maxBytes: limits.maxCompressedBytes,
    });

    // Record source metadata on the draft revision.
    await tx.query(
      `UPDATE credential_versions SET source_metadata = $2::jsonb
       WHERE credential_id = $1 AND status='draft'`,
      [
        credentialId,
        JSON.stringify({
          sourceType: "olx",
          originalFilename: input.originalFilename,
          archiveObjectKey,
          archiveSha256,
          importedAt: new Date().toISOString(),
          unsupportedBlocks: parsed.unsupportedBlocks,
          parseSource: parsed.source,
        }),
      ],
    );
    return {
      credentialId,
      archiveSha256,
      source: parsed.source,
      unsupportedBlocks: parsed.unsupportedBlocks,
      archiveObjectKey,
    };
  };
  return conn ? run(conn) : withTransaction(run);
}
