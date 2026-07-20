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
