import { describe, expect, it } from "vitest";
import {
  assembleDocuments,
  toBuilderState,
  certificationRule,
  youtubeIdFromUrl,
  newId,
  type BuilderState,
} from "@/lib/admin/builder/model";
import { validateDraftForPublish, assertNoGradingLeak } from "@/lib/content/validate";

function sampleState(): BuilderState {
  return {
    certification: { thresholdPercent: 50, requiredUnitIds: [] },
    sections: [
      {
        id: "s-1",
        sourceKey: null,
        title: "Introduction",
        subsections: [
          {
            id: "ss-1",
            sourceKey: null,
            title: "Welcome",
            units: [
              {
                id: "u-vid",
                sourceKey: null,
                type: "video",
                title: "Intro video",
                required: true,
                data: { youtubeId: "dQw4w9WgXcQ" },
              },
              {
                id: "u-read",
                sourceKey: null,
                type: "reading",
                title: "Read me",
                required: true,
                data: { html: "<p>hello</p>" },
              },
              {
                id: "u-mcq",
                sourceKey: null,
                type: "mcq",
                title: "Quiz",
                required: true,
                data: {
                  passMark: 50,
                  questions: [
                    {
                      id: "q-1",
                      text: "2+2?",
                      points: 1,
                      options: [
                        { id: "o-a", text: "4", correct: true },
                        { id: "o-b", text: "5", correct: false },
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
}

describe("builder model — assembly", () => {
  it("puts correct answers ONLY in grading, never in content", () => {
    const { content, grading } = assembleDocuments(sampleState());
    // content must not contain correctness/points anywhere
    const contentJson = JSON.stringify(content);
    expect(contentJson).not.toMatch(/correct/i);
    expect(contentJson).not.toMatch(/points/i);
    expect(() => assertNoGradingLeak(content)).not.toThrow();
    // grading holds the answer
    expect(grading.units[0]!.questions[0]!.correctOptionIds).toEqual(["o-a"]);
    expect(grading.units[0]!.maxAttempts).toBe(1);
  });

  it("assembled documents pass the real publish validator", () => {
    const { content, grading } = assembleDocuments(sampleState());
    const rule = certificationRule(sampleState());
    expect(() =>
      validateDraftForPublish({ content, grading, certificationRule: rule }),
    ).not.toThrow();
  });

  it("round-trips (assemble -> toBuilderState) preserving IDs, order and answers", () => {
    const state = sampleState();
    const { content, grading } = assembleDocuments(state);
    const back = toBuilderState(content, grading, certificationRule(state));
    expect(back.sections[0]!.id).toBe("s-1");
    expect(back.sections[0]!.subsections[0]!.units.map((u) => u.id)).toEqual([
      "u-vid",
      "u-read",
      "u-mcq",
    ]);
    const mcq = back.sections[0]!.subsections[0]!.units[2]!;
    expect(mcq.type).toBe("mcq");
    if (mcq.type === "mcq") {
      expect(mcq.data.questions[0]!.options.find((o) => o.correct)?.id).toBe("o-a");
    }
  });
});

describe("builder model — helpers", () => {
  it("parses youtube urls and bare ids", () => {
    expect(youtubeIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeIdFromUrl("not a video")).toBeNull();
  });

  it("generates unique prefixed ids", () => {
    const ids = new Set([newId("s"), newId("s"), newId("u"), newId("q")]);
    expect(ids.size).toBe(4);
    expect([...ids].every((i) => /^[a-z]{1,2}-[A-Za-z0-9]+$/.test(i))).toBe(true);
  });
});
