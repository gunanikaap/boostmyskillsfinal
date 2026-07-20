import { writeTarGz } from "@/lib/olx/tarWriter";
import type { ContentDocument, GradingDocument } from "@/lib/content/schema";

export interface ExportMeta {
  code: string;
  slug: string;
  title: string;
  authorName: string;
  certificationRule: unknown;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Export a credential's content to an OLX-subset .tar.gz. It emits a genuine
 * OLX-shaped tree (course.xml + chapter/sequential/html/video/problem files)
 * AND a `course/bms/manifest.json` sidecar that captures the full content and
 * grading for a lossless BoostMySkills → BoostMySkills round trip.
 *
 * Full Open edX XBlock fidelity is NOT claimed; the supported unit types are
 * html (reading), video (YouTube) and single/multi-select problem (MCQ).
 */
export function exportCredentialToOlx(
  content: ContentDocument,
  grading: GradingDocument,
  meta: ExportMeta,
): Buffer {
  const files: { path: string; content: string }[] = [];
  const chapterRefs: string[] = [];

  for (const section of content.sections) {
    chapterRefs.push(`  <chapter url_name="${xmlEscape(section.id)}"/>`);
    const seqRefs: string[] = [];
    for (const sub of section.subsections) {
      seqRefs.push(`  <sequential url_name="${xmlEscape(sub.id)}"/>`);
      const compRefs: string[] = [];
      for (const unit of sub.units) {
        const tag = unit.type === "reading" ? "html" : unit.type === "video" ? "video" : "problem";
        compRefs.push(`  <${tag} url_name="${xmlEscape(unit.id)}"/>`);
        if (unit.type === "reading") {
          const d = unit.data as { html: string };
          files.push({
            path: `course/html/${unit.id}.xml`,
            content: `<html filename="${xmlEscape(unit.id)}" display_name="${xmlEscape(unit.title)}"/>`,
          });
          files.push({ path: `course/html/${unit.id}.html`, content: d.html });
        } else if (unit.type === "video") {
          const d = unit.data as { youtubeId?: string };
          files.push({
            path: `course/video/${unit.id}.xml`,
            content: `<video url_name="${xmlEscape(unit.id)}" display_name="${xmlEscape(unit.title)}" youtube_id_1_0="${xmlEscape(d.youtubeId ?? "")}"/>`,
          });
        } else {
          const d = unit.data as {
            questions: { id: string; text: string; options: { id: string; text: string }[] }[];
          };
          const gUnit = grading.units.find((u) => u.unitId === unit.id);
          const problems = d.questions
            .map((q) => {
              const correct = new Set(
                gUnit?.questions.find((x) => x.questionId === q.id)?.correctOptionIds ?? [],
              );
              const choices = q.options
                .map(
                  (o) =>
                    `      <choice correct="${correct.has(o.id) ? "true" : "false"}" url_name="${xmlEscape(o.id)}">${xmlEscape(o.text)}</choice>`,
                )
                .join("\n");
              return `    <multiplechoiceresponse url_name="${xmlEscape(q.id)}">\n      <label>${xmlEscape(q.text)}</label>\n${choices}\n    </multiplechoiceresponse>`;
            })
            .join("\n");
          files.push({
            path: `course/problem/${unit.id}.xml`,
            content: `<problem display_name="${xmlEscape(unit.title)}" url_name="${xmlEscape(unit.id)}">\n${problems}\n</problem>`,
          });
        }
      }
      files.push({
        path: `course/sequential/${sub.id}.xml`,
        content: `<sequential display_name="${xmlEscape(sub.title)}">\n${compRefs.join("\n")}\n</sequential>`,
      });
    }
    files.push({
      path: `course/chapter/${section.id}.xml`,
      content: `<chapter display_name="${xmlEscape(section.title)}">\n${seqRefs.join("\n")}\n</chapter>`,
    });
  }

  files.push({
    path: `course/course.xml`,
    content: `<course display_name="${xmlEscape(meta.title)}" course="${xmlEscape(meta.code)}">\n${chapterRefs.join("\n")}\n</course>`,
  });

  // Lossless sidecar (admin-only export; enables faithful re-import/promotion).
  files.push({
    path: `course/bms/manifest.json`,
    content: JSON.stringify({ schemaVersion: 1, meta, content, grading }, null, 2),
  });

  return writeTarGz(files);
}
