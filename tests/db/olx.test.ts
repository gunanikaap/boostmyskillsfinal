import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { exportCredentialToOlx } from "@/lib/olx/exporter";
import { importOlxToDraft, parseCourse } from "@/lib/olx/importer";
import { inspectTarGz } from "@/lib/olx/archiveSafety";
import { writeTarGz } from "@/lib/olx/tarWriter";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeProject, makeUser } from "@/tests/helpers/factories";
import type { ContentDocument, GradingDocument } from "@/lib/content/schema";

beforeEach(resetDb);
afterAll(teardown);

const content: ContentDocument = {
  schemaVersion: 1,
  sections: [
    {
      id: "sec1",
      sourceKey: null,
      title: "Section One",
      subsections: [
        {
          id: "sub1",
          sourceKey: null,
          title: "Subsection One",
          units: [
            {
              id: "r1",
              sourceKey: null,
              type: "reading",
              title: "Read",
              required: true,
              data: { html: "<p>Hello</p>" },
            },
            {
              id: "v1",
              sourceKey: null,
              type: "video",
              title: "Watch",
              required: true,
              data: { youtubeId: "abc123" },
            },
            {
              id: "m1",
              sourceKey: null,
              type: "mcq",
              title: "Quiz",
              required: true,
              data: {
                passMark: 50,
                questions: [
                  {
                    id: "q1",
                    text: "2+2?",
                    options: [
                      { id: "oa", text: "4" },
                      { id: "ob", text: "5" },
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
const grading: GradingDocument = {
  schemaVersion: 1,
  units: [
    {
      unitId: "m1",
      passMark: 50,
      maxAttempts: 1,
      questions: [{ questionId: "q1", correctOptionIds: ["oa"], points: 1 }],
    },
  ],
};
const meta = {
  code: "MC-RT",
  slug: "mc-rt",
  title: "Round Trip",
  authorName: "A",
  certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
};

describe("OLX export/import round trip", () => {
  it("exports to a safe archive and re-imports losslessly", () => {
    const gz = exportCredentialToOlx(content, grading, meta);
    // The exported archive itself must pass archive-safety.
    const entries = inspectTarGz(gz);
    expect(entries.some((e) => e.path === "course/course.xml")).toBe(true);

    const parsed = parseCourse(entries);
    expect(parsed.source).toBe("bms-manifest");
    // structure, ids, unit types and content survive the round trip
    expect(parsed.content).toEqual(content);
    expect(parsed.grading).toEqual(grading);
  });

  it("imports as a DRAFT credential (never published) with source metadata", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const gz = exportCredentialToOlx(content, grading, meta);
    const res = await importOlxToDraft({
      gz,
      originalFilename: "course.tar.gz",
      projectId: project,
      adminId: admin,
    });

    const cred = await getPool().query(`SELECT status FROM micro_credentials WHERE id=$1`, [
      res.credentialId,
    ]);
    expect(cred.rows[0]!.status).toBe("draft");
    const ver = await getPool().query(
      `SELECT status, source_metadata FROM credential_versions WHERE credential_id=$1`,
      [res.credentialId],
    );
    expect(ver.rows[0]!.status).toBe("draft");
    expect((ver.rows[0]!.source_metadata as { sourceType: string }).sourceType).toBe("olx");
  });
});

describe("standard edX OLX import (pointer course.xml + verticals + PDFs)", () => {
  // Mirrors the real exports in olx_samples: course.xml is a pointer to the run
  // file, chapter -> sequential -> vertical -> components, choices under
  // <choicegroup>, and PDF "readings" embedded as /static iframes.
  function standardArchive() {
    return writeTarGz([
      { path: "course/course.xml", content: `<course url_name="run1" org="ORG" course="SYN-1"/>` },
      {
        path: "course/course/run1.xml",
        content: `<course display_name="Synthetic Course"><chapter url_name="ch1"/></course>`,
      },
      {
        path: "course/chapter/ch1.xml",
        content: `<chapter display_name="Chapter A"><sequential url_name="sq1"/></chapter>`,
      },
      {
        path: "course/sequential/sq1.xml",
        content: `<sequential display_name="Seq A"><vertical url_name="v1"/><vertical url_name="v2"/><vertical url_name="v3"/></sequential>`,
      },
      {
        path: "course/vertical/v1.xml",
        content: `<vertical display_name="Reading"><html url_name="h1"/></vertical>`,
      },
      {
        path: "course/vertical/v2.xml",
        content: `<vertical display_name="Watch"><video url_name="vid1"/></vertical>`,
      },
      {
        path: "course/vertical/v3.xml",
        content: `<vertical display_name="Exercise"><problem url_name="p1"/></vertical>`,
      },
      { path: "course/html/h1.xml", content: `<html filename="h1" display_name="Raw HTML"/>` },
      {
        path: "course/html/h1.html",
        content: `<p><iframe src="/static/doc.pdf" width="100%"></iframe></p>`,
      },
      { path: "course/static/doc.pdf", content: `%PDF-1.4 fake pdf bytes` },
      {
        path: "course/video/vid1.xml",
        content: `<video youtube="1.00:abc123" youtube_id_1_0="abc123" display_name="Intro"/>`,
      },
      {
        path: "course/problem/p1.xml",
        content: `<problem display_name="Multiple Choice"><p><strong>Q1</strong></p><p>Pick one</p><multiplechoiceresponse><choicegroup><choice correct="false">Wrong</choice><choice correct="true">Right</choice></choicegroup></multiplechoiceresponse></problem>`,
      },
    ]);
  }

  it("walks pointer/vertical structure into readings, videos, MCQs and PDF units", () => {
    const parsed = parseCourse(inspectTarGz(standardArchive()));
    expect(parsed.source).toBe("olx");
    expect(parsed.meta.title).toBe("Synthetic Course");
    expect(parsed.content.sections[0]!.title).toBe("Chapter A");
    const units = parsed.content.sections[0]!.subsections[0]!.units;
    const byType = units.map((u) => u.type).sort();
    expect(byType).toEqual(["mcq", "pdf", "video"]);

    const video = units.find((u) => u.type === "video")!;
    expect((video.data as { youtubeId: string }).youtubeId).toBe("abc123");

    const pdf = units.find((u) => u.type === "pdf")!;
    expect(pdf.title).toBe("Reading");
    expect(parsed.pdfAssets).toEqual([{ unitId: "h1", staticName: "doc.pdf" }]);

    // Correct answer lives only in grading, never in learner content.
    const g = parsed.grading.units.find((u) => u.unitId === "p1")!;
    expect(g.questions[0]!.correctOptionIds).toHaveLength(1);
    expect(JSON.stringify(parsed.content)).not.toMatch(/correct/i);
  });

  it("stores the PDF asset and gives the pdf unit a real objectKey", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const res = await importOlxToDraft({
      gz: standardArchive(),
      originalFilename: "synthetic.tar.gz",
      projectId: project,
      adminId: admin,
    });
    const ver = await getPool().query(
      `SELECT content_document FROM credential_versions WHERE credential_id=$1 AND status='draft'`,
      [res.credentialId],
    );
    const content = ver.rows[0]!.content_document as ContentDocument;
    const pdf = content.sections[0]!.subsections[0]!.units.find((u) => u.type === "pdf")!;
    const key = (pdf.data as { objectKey: string }).objectKey;
    expect(key).toContain("content/");
    expect(key).not.toContain("pending");
  });
});

describe("raw OLX (no BMS manifest) import", () => {
  it("parses a minimal OLX course tree and sanitises reading HTML", () => {
    const gz = writeTarGz([
      {
        path: "course/course.xml",
        content: `<course display_name="Raw" course="RAW"><chapter url_name="c1"/></course>`,
      },
      {
        path: "course/chapter/c1.xml",
        content: `<chapter display_name="Chapter 1"><sequential url_name="s1"/></chapter>`,
      },
      {
        path: "course/sequential/s1.xml",
        content: `<sequential display_name="Seq 1"><html url_name="h1"/><problem url_name="p1"/></sequential>`,
      },
      { path: "course/html/h1.xml", content: `<html display_name="Reading"/>` },
      { path: "course/html/h1.html", content: `<p>ok</p><script>alert(1)</script>` },
      {
        path: "course/problem/p1.xml",
        content: `<problem display_name="Q" url_name="p1"><multiplechoiceresponse url_name="q1"><label>Pick</label><choice correct="false" url_name="oa">A</choice><choice correct="true" url_name="ob">B</choice></multiplechoiceresponse></problem>`,
      },
    ]);
    const entries = inspectTarGz(gz);
    const parsed = parseCourse(entries);
    expect(parsed.source).toBe("olx");
    expect(parsed.content.sections[0]!.title).toBe("Chapter 1");
    const reading = parsed.content.sections[0]!.subsections[0]!.units.find(
      (u) => u.type === "reading",
    )!;
    expect((reading.data as { html: string }).html).not.toMatch(/script/i); // sanitised
    // correct answer extracted into grading, not exposed in content
    const gUnit = parsed.grading.units.find((u) => u.unitId === "p1")!;
    expect(gUnit.questions[0]!.correctOptionIds).toEqual(["ob"]);
    expect(JSON.stringify(parsed.content)).not.toMatch(/correctOptionIds/);
  });
});
