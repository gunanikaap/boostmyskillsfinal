import { describe, expect, it } from "vitest";
import {
  validateDraftForPublish,
  ContentValidationError,
  assertNoGradingLeak,
} from "@/lib/content/validate";
import {
  sanitizeHtml,
  containsUnsafeHtml,
  sanitizeContentDocumentHtml,
} from "@/lib/content/sanitize";
import { contentDocumentSchema } from "@/lib/content/schema";
import { sampleContent } from "@/tests/helpers/factories";

describe("content document HTML sanitisation (builder ingest)", () => {
  it("strips script/handlers from a reading unit's HTML in place", () => {
    const doc = {
      schemaVersion: 1,
      sections: [
        {
          id: "s1",
          sourceKey: null,
          title: "S",
          subsections: [
            {
              id: "sub1",
              sourceKey: null,
              title: "Sub",
              units: [
                {
                  id: "r1",
                  sourceKey: null,
                  type: "reading",
                  title: "R",
                  required: true,
                  data: {
                    html: `<p onclick="steal()">ok</p><script>fetch('/x')</script><a href="javascript:alert(1)">x</a>`,
                  },
                },
                {
                  id: "v1",
                  sourceKey: null,
                  type: "video",
                  title: "V",
                  required: true,
                  data: { youtubeId: "abc" },
                },
              ],
            },
          ],
        },
      ],
    };
    sanitizeContentDocumentHtml(doc);
    const html = (doc.sections[0]!.subsections[0]!.units[0]!.data as { html: string }).html;
    expect(html).not.toMatch(/script/i);
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("ok");
    // Non-reading units are left untouched.
    expect(doc.sections[0]!.subsections[0]!.units[1]!.data).toEqual({ youtubeId: "abc" });
  });

  it("is a no-op for malformed/partial documents", () => {
    expect(sanitizeContentDocumentHtml(null)).toBeNull();
    expect(sanitizeContentDocumentHtml({})).toEqual({});
    expect(sanitizeContentDocumentHtml({ sections: "nope" })).toEqual({ sections: "nope" });
  });
});

describe("content contract validation", () => {
  it("accepts a well-formed draft", () => {
    const s = sampleContent();
    const { content, grading } = validateDraftForPublish(s);
    expect(content.sections).toHaveLength(1);
    expect(grading.units).toHaveLength(1);
  });

  it("rejects duplicate stable ids", () => {
    const s = sampleContent();
    // duplicate the section id onto the subsection
    s.content.sections[0]!.subsections[0]!.id = s.content.sections[0]!.id;
    expect(() => validateDraftForPublish(s)).toThrow(ContentValidationError);
  });

  it("rejects grading that references a non-existent option", () => {
    const s = sampleContent();
    s.grading.units[0]!.questions[0]!.correctOptionIds = ["does-not-exist"];
    expect(() => validateDraftForPublish(s)).toThrow(/unknown option/);
  });

  it("rejects grading that references an unknown mcq unit", () => {
    const s = sampleContent();
    s.grading.units[0]!.unitId = "no-such-unit";
    expect(() => validateDraftForPublish(s)).toThrow(/unknown mcq unit/);
  });

  it("structurally forbids correct answers inside the content document", () => {
    const bad = sampleContent().content as unknown as {
      sections: { subsections: { units: { data: { questions: { options: unknown[] }[] } }[] }[] }[];
    };
    // Attempt to smuggle an `isCorrect` flag into an option — strict schema must reject.
    (
      bad.sections[0]!.subsections[0]!.units[0]!.data.questions[0]!.options[0] as Record<
        string,
        unknown
      >
    ).isCorrect = true;
    expect(contentDocumentSchema.safeParse(bad).success).toBe(false);
  });

  it("assertNoGradingLeak throws when correctOptionIds is present", () => {
    expect(() => assertNoGradingLeak({ units: [{ correctOptionIds: ["a"] }] })).toThrow();
    expect(() => assertNoGradingLeak({ sections: [] })).not.toThrow();
  });
});

describe("html sanitiser", () => {
  it("removes script tags and their content", () => {
    const out = sanitizeHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toBe("<p>hi</p>");
    expect(out).not.toMatch(/script/i);
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<p onclick="steal()">hi</p>');
    expect(out).not.toMatch(/onclick/i);
  });

  it("neutralises javascript: urls on links", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("keeps safe formatting and https links", () => {
    const out = sanitizeHtml('<p><strong>bold</strong> <a href="https://x.example">link</a></p>');
    expect(out).toMatch(/<strong>bold<\/strong>/);
    expect(out).toMatch(/href="https:\/\/x.example"/);
  });

  it("containsUnsafeHtml flags dangerous markup", () => {
    expect(containsUnsafeHtml("<img src=x onerror=alert(1)>")).toBe(true);
    expect(containsUnsafeHtml("<p>clean</p>")).toBe(false);
  });
});
