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
import type { StorageProvider, PutOptions } from "@/lib/storage/types";
import { olxArchiveKey, contentAssetKey } from "@/lib/storage/keys";

export interface PdfAsset {
  unitId: string;
  /** Static file name referenced from the OLX `/static/<name>` (URL-decoded). */
  staticName: string;
}

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
  /** PDF `/static` assets referenced by pdf units, resolved by the importer. */
  pdfAssets: PdfAsset[];
}

/** Placeholder objectKey for a pdf unit until the importer stores the asset. */
const PENDING_PDF_KEY = "pending-pdf-asset";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Do not allow entity expansion attacks; fast-xml-parser does not process DTDs.
  processEntities: true,
});

type XmlNode = Record<string, unknown>;

function fileMap(entries: { path: string; content: Buffer }[]): Map<string, Buffer> {
  const m = new Map<string, Buffer>();
  for (const e of entries) m.set(e.path.replace(/^\.\//, ""), e.content);
  return m;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Recursively extract readable text from a parsed XML node (skips attributes). */
function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object") {
    let s = "";
    for (const [k, v] of Object.entries(node as XmlNode)) {
      if (k.startsWith("@_")) continue;
      s += ` ${textOf(v)}`;
    }
    return s;
  }
  return "";
}

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

// Generic, non-descriptive OLX display names we prefer to replace with the
// enclosing unit's (vertical) name when one is available.
const GENERIC_TITLES = new Set(["", "raw html", "multiple choice", "problem", "text", "html"]);
function meaningful(s: unknown): string {
  const c = clean(s);
  return c && !GENERIC_TITLES.has(c.toLowerCase()) ? c : "";
}
function pickTitle(candidates: unknown[], fallback: string): string {
  for (const c of candidates) {
    const m = clean(c);
    if (m) return m;
  }
  return fallback;
}

/** First `<strong>` label inside a problem's `<p>` children (e.g. "Final Exam Q2"). */
function problemLabel(pDoc: XmlNode): string {
  for (const p of asArray(pDoc.p)) {
    if (p && typeof p === "object" && "strong" in (p as XmlNode)) {
      const t = clean(textOf((p as XmlNode).strong));
      if (t) return t;
    }
  }
  return "";
}

/** Extract a YouTube id from an edX `<video>` node (`youtube_id_1_0` or `youtube`). */
function youtubeId(video: XmlNode): string {
  const direct = clean(video["@_youtube_id_1_0"]);
  if (direct) return direct;
  // `youtube="1.00:ID[,speed:ID...]"` — take the first id after the colon.
  const combined = clean(video["@_youtube"]);
  const m = /(?:^|,)\s*[\d.]+:([\w-]+)/.exec(combined);
  return m?.[1] ?? "";
}

const PDF_SRC_RE = /(?:src|href)\s*=\s*["']\/static\/([^"']+\.pdf)["']/i;

type Unit = ContentDocument["sections"][number]["subsections"][number]["units"][number];
type GradingUnit = GradingDocument["units"][number];

interface ParseCtx {
  files: Map<string, Buffer>;
  gradingUnits: GradingUnit[];
  pdfAssets: PdfAsset[];
  unsupportedBlocks: string[];
}

/**
 * Resolve the course root. `course/course.xml` may hold the chapters inline
 * (simple OLX) OR be a pointer `<course url_name="RUN" .../>` to the real
 * structure in `course/course/<RUN>.xml` (standard edX export). Returns the node
 * that actually carries `<chapter>` refs, plus the merged attributes.
 */
function resolveCourseRoot(files: Map<string, Buffer>): { chapters: XmlNode; attrs: XmlNode } {
  const rootXml = files.get("course/course.xml");
  if (!rootXml) throw new OlxArchiveError("invalid_archive", "missing course/course.xml");
  const root = (parser.parse(rootXml.toString("utf8")).course ?? {}) as XmlNode;
  if (root.chapter) return { chapters: root, attrs: root };

  const run = clean(root["@_url_name"]);
  const runXml = run ? files.get(`course/course/${run}.xml`) : undefined;
  if (runXml) {
    const runDoc = (parser.parse(runXml.toString("utf8")).course ?? {}) as XmlNode;
    return { chapters: runDoc, attrs: { ...root, ...runDoc } };
  }
  return { chapters: root, attrs: root };
}

/** Collect html/video/problem components from a container (a sequential or a vertical). */
function collectComponents(
  container: XmlNode,
  containerTitle: string,
  ctx: ParseCtx,
  units: Unit[],
): void {
  const { files } = ctx;

  for (const ref of asArray(container.html)) {
    const id = clean((ref as XmlNode)["@_url_name"]);
    if (!id) continue;
    const metaDoc = (parser.parse(files.get(`course/html/${id}.xml`)?.toString("utf8") ?? "<html/>")
      .html ?? {}) as XmlNode;
    const filename = clean(metaDoc["@_filename"]) || id;
    const raw = files.get(`course/html/${filename}.html`)?.toString("utf8") ?? "";
    const pdf = PDF_SRC_RE.exec(raw);
    const title = pickTitle([meaningful(metaDoc["@_display_name"]), containerTitle], "Reading");
    if (pdf) {
      const staticName = decodeURIComponent(pdf[1]!);
      units.push({
        id,
        sourceKey: id,
        type: "pdf",
        title: pickTitle([meaningful(metaDoc["@_display_name"]), containerTitle], "Document"),
        required: true,
        data: { objectKey: PENDING_PDF_KEY, filename: staticName.split("/").pop() ?? staticName },
      });
      ctx.pdfAssets.push({ unitId: id, staticName });
    } else {
      units.push({
        id,
        sourceKey: id,
        type: "reading",
        title,
        required: true,
        data: { html: sanitizeHtml(raw) },
      });
    }
  }

  for (const ref of asArray(container.video)) {
    const id = clean((ref as XmlNode)["@_url_name"]);
    if (!id) continue;
    const vDoc = (parser.parse(files.get(`course/video/${id}.xml`)?.toString("utf8") ?? "<video/>")
      .video ?? {}) as XmlNode;
    const yt = youtubeId(vDoc);
    units.push({
      id,
      sourceKey: id,
      type: "video",
      title: pickTitle([meaningful(vDoc["@_display_name"]), containerTitle], "Video"),
      required: true,
      data: yt ? { youtubeId: yt } : { mediaObjectKey: `imported/${id}` },
    });
  }

  for (const ref of asArray(container.problem)) {
    const id = clean((ref as XmlNode)["@_url_name"]);
    if (!id) continue;
    const pDoc = (parser.parse(
      files.get(`course/problem/${id}.xml`)?.toString("utf8") ?? "<problem/>",
    ).problem ?? {}) as XmlNode;
    const questions: { id: string; text: string; options: { id: string; text: string }[] }[] = [];
    const gQuestions: GradingUnit["questions"] = [];
    for (const mc of asArray(pDoc.multiplechoiceresponse)) {
      const m = mc as XmlNode;
      const qid = clean(m["@_url_name"]) || `${id}-q${questions.length + 1}`;
      const qText = clean(textOf(m.label)) || clean(textOf(pDoc.p)) || "Question";
      // Choices sit under <choicegroup> (standard edX) or directly (simple OLX).
      const choicegroup = m.choicegroup as XmlNode | undefined;
      const choiceList = asArray(choicegroup?.choice ?? m.choice);
      const options: { id: string; text: string }[] = [];
      const correct: string[] = [];
      choiceList.forEach((c, i) => {
        const ch = c as XmlNode;
        const oid = clean(ch["@_url_name"]) || `${qid}-o${i + 1}`;
        options.push({ id: oid, text: clean(textOf(ch)) });
        if (clean(ch["@_correct"]).toLowerCase() === "true") correct.push(oid);
      });
      if (options.length === 0) continue;
      questions.push({ id: qid, text: qText, options });
      gQuestions.push({
        questionId: qid,
        correctOptionIds: correct.length ? correct : [options[0]!.id],
        points: 1,
      });
    }
    if (questions.length === 0) {
      ctx.unsupportedBlocks.push(`problem:${id}`);
      continue;
    }
    units.push({
      id,
      sourceKey: id,
      type: "mcq",
      title: pickTitle(
        [problemLabel(pDoc), meaningful(pDoc["@_display_name"]), containerTitle],
        "Assessment",
      ),
      required: true,
      data: { passMark: 50, questions },
    });
    ctx.gradingUnits.push({ unitId: id, passMark: 50, maxAttempts: 1, questions: gQuestions });
  }
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
      pdfAssets: [],
    };
  }

  // Best-effort OLX path (handles standard edX exports: pointer course.xml,
  // chapter -> sequential -> vertical -> components).
  const { chapters, attrs } = resolveCourseRoot(files);
  const title = clean(attrs["@_display_name"]) || "Imported course";
  const code = clean(attrs["@_course"]) || `IMP-${title}`.slice(0, 40);

  const ctx: ParseCtx = { files, gradingUnits: [], pdfAssets: [], unsupportedBlocks: [] };
  const sections: ContentDocument["sections"] = [];

  for (const chapterRef of asArray(chapters.chapter)) {
    const chapId = clean((chapterRef as XmlNode)["@_url_name"]);
    const chapDoc = files.get(`course/chapter/${chapId}.xml`);
    if (!chapDoc) continue;
    const chapter = (parser.parse(chapDoc.toString("utf8")).chapter ?? {}) as XmlNode;
    const subsections: ContentDocument["sections"][number]["subsections"] = [];

    for (const seqRef of asArray(chapter.sequential)) {
      const seqId = clean((seqRef as XmlNode)["@_url_name"]);
      const seqDoc = files.get(`course/sequential/${seqId}.xml`);
      if (!seqDoc) continue;
      const seq = (parser.parse(seqDoc.toString("utf8")).sequential ?? {}) as XmlNode;
      const units: Unit[] = [];

      // Components may sit directly under the sequential (simple OLX) or inside
      // verticals (standard edX). Handle both, in document order.
      collectComponents(seq, "", ctx, units);
      for (const vertRef of asArray(seq.vertical)) {
        const vertId = clean((vertRef as XmlNode)["@_url_name"]);
        const vertDoc = files.get(`course/vertical/${vertId}.xml`);
        if (!vertDoc) continue;
        const vert = (parser.parse(vertDoc.toString("utf8")).vertical ?? {}) as XmlNode;
        collectComponents(vert, clean(vert["@_display_name"]), ctx, units);
      }

      subsections.push({
        id: seqId,
        sourceKey: seqId,
        title: clean(seq["@_display_name"]) || "Subsection",
        units,
      });
    }
    sections.push({
      id: chapId,
      sourceKey: chapId,
      title: clean(chapter["@_display_name"]) || "Section",
      subsections,
    });
  }

  const content: ContentDocument = { schemaVersion: CONTENT_SCHEMA_VERSION, sections };
  const grading: GradingDocument = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    units: ctx.gradingUnits,
  };

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
    unsupportedBlocks: ctx.unsupportedBlocks,
    source: "olx",
    pdfAssets: ctx.pdfAssets,
  };
}

/**
 * Point a parsed pdf unit at its stored asset key, or — if the asset was missing
 * from the archive — degrade it to a short reading note so the draft stays valid.
 */
function setPdfUnit(content: ContentDocument, unitId: string, objectKey: string | null): void {
  for (const section of content.sections) {
    for (const sub of section.subsections) {
      for (const unit of sub.units) {
        if (unit.id !== unitId || unit.type !== "pdf") continue;
        if (objectKey) {
          (unit.data as { objectKey?: string }).objectKey = objectKey;
        } else {
          const filename = (unit.data as { filename?: string }).filename ?? "document";
          const u = unit as unknown as { type: string; data: unknown };
          u.type = "reading";
          u.data = { html: `<p><em>Imported PDF unavailable: ${filename}</em></p>` };
        }
        return;
      }
    }
  }
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
    /** Injectable storage boundary (defaults to the configured provider). */
    storage?: StorageProvider;
  },
  limits: ArchiveLimits = DEFAULT_LIMITS,
  conn?: Queryable,
): Promise<ImportResult> {
  const entries = inspectTarGz(input.gz, limits); // throws OlxArchiveError on danger
  const archiveSha256 = createHash("sha256").update(input.gz).digest("hex");
  const parsed = parseCourse(entries);
  const staticFiles = fileMap(entries);
  const storage = input.storage ?? getStorage();
  const opId = archiveSha256.slice(0, 8); // safe, non-secret operation id (checksum prefix)

  // Object storage cannot participate in the DB transaction, so track every key
  // THIS operation writes and owns; on any failure we roll back the DB and
  // best-effort delete exactly those objects (never a caller-supplied key).
  const ownedKeys: string[] = [];
  const ownsArchiveKey = input.archiveObjectKey === undefined;
  const putOwned = async (key: string, bytes: Buffer, opts: PutOptions): Promise<void> => {
    await storage.putObject(key, bytes, opts);
    ownedKeys.push(key);
  };

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

    // Store each referenced /static PDF as its own content asset and point the
    // pdf unit at it (served, authorised, through /content-asset). A missing
    // asset is recorded as unsupported rather than failing the whole import.
    if (parsed.pdfAssets.length > 0) {
      const revId = (
        await tx.query(
          `SELECT id FROM credential_versions WHERE credential_id = $1 AND status='draft'`,
          [credentialId],
        )
      ).rows[0] as { id: string } | undefined;
      const revisionId = revId?.id ?? credentialId;
      for (const asset of parsed.pdfAssets) {
        const bytes = staticFiles.get(`course/static/${asset.staticName}`);
        if (!bytes) {
          parsed.unsupportedBlocks.push(`pdf-missing:${asset.staticName}`);
          setPdfUnit(parsed.content, asset.unitId, null);
          continue;
        }
        const key = contentAssetKey(credentialId, revisionId, asset.staticName);
        await putOwned(key, bytes, {
          contentType: "application/pdf",
          maxBytes: limits.maxFileBytes,
        });
        setPdfUnit(parsed.content, asset.unitId, key);
      }
    }

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
    // (server-generated key; never a filesystem path). We own (and would clean
    // up) a key we generated, but NOT a caller-supplied archive key.
    const archiveObjectKey = input.archiveObjectKey ?? olxArchiveKey(credentialId);
    if (ownsArchiveKey) {
      await putOwned(archiveObjectKey, input.gz, {
        contentType: "application/gzip",
        maxBytes: limits.maxCompressedBytes,
      });
    } else {
      await storage.putObject(archiveObjectKey, input.gz, {
        contentType: "application/gzip",
        maxBytes: limits.maxCompressedBytes,
      });
    }

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

  try {
    return await (conn ? run(conn) : withTransaction(run));
  } catch (err) {
    // The DB transaction has rolled back; compensate the (non-transactional)
    // object writes this operation owns. Best-effort — a cleanup failure is
    // surfaced as a warning and never hides the original import error.
    let failures = 0;
    for (const key of ownedKeys) {
      try {
        await storage.deleteObject(key);
      } catch {
        failures += 1;
      }
    }
    if (ownedKeys.length > 0) {
      // Safe log: operation id + counts only — no paths, filenames or contents.
      // eslint-disable-next-line no-console
      console.warn(
        `olx-import ${opId}: rolled back; cleaned ${ownedKeys.length - failures}/${ownedKeys.length} object(s), ${failures} cleanup failure(s)`,
      );
    }
    throw err;
  }
}
