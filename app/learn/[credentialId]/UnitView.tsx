"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMcqAction, markUnitCompleteAction } from "./actions";
import type { UnitState, McqReview } from "@/lib/learner/queries";

// The unit shape the player receives — NO correct answers are present.
export interface PlayerUnit {
  id: string;
  type: "video" | "reading" | "pdf" | "mcq";
  title: string;
  data: unknown;
}

export function UnitView({
  credentialId,
  unit,
  state,
  review,
}: {
  credentialId: string;
  unit: PlayerUnit;
  state?: UnitState;
  review?: McqReview | null;
}) {
  return (
    <div className="unit">
      {unit.type === "video" && <VideoUnit data={unit.data} />}
      {unit.type === "reading" && <ReadingUnit data={unit.data} />}
      {unit.type === "pdf" && <PdfUnit data={unit.data} />}
      {unit.type === "mcq" && (
        <McqUnit
          credentialId={credentialId}
          unitId={unit.id}
          data={unit.data}
          locked={Boolean(state?.attempted)}
          review={review ?? null}
        />
      )}
      {unit.type !== "mcq" && (
        <MarkComplete
          credentialId={credentialId}
          unitId={unit.id}
          done={state?.status === "completed"}
        />
      )}
    </div>
  );
}

function VideoUnit({ data }: { data: unknown }) {
  const d = data as { youtubeId?: string; mediaObjectKey?: string };
  if (d.youtubeId) {
    return (
      <div className="unit-video">
        <iframe
          title="video"
          src={`https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}`}
          allowFullScreen
        />
      </div>
    );
  }
  return <p style={{ color: "var(--bms-muted)" }}>Media: {d.mediaObjectKey ?? "unavailable"}</p>;
}

function ReadingUnit({ data }: { data: unknown }) {
  const d = data as { html?: string };
  // html was sanitised server-side at authoring time.
  return <div className="unit-content" dangerouslySetInnerHTML={{ __html: d.html ?? "" }} />;
}

function PdfUnit({ data }: { data: unknown }) {
  const d = data as { url?: string; objectKey?: string; filename?: string };
  // Imported PDFs are stored content assets served (with auth) via /content-asset;
  // an admin-entered external URL is used directly when present.
  const src = d.url ?? (d.objectKey ? `/content-asset/${d.objectKey}` : null);
  if (!src) {
    return <p style={{ color: "var(--bms-muted)" }}>PDF unavailable.</p>;
  }
  return (
    <div className="unit-pdf">
      <iframe title={d.filename ?? "PDF document"} src={`${src}#view=FitH`} />
      <a href={src} target="_blank" rel="noopener noreferrer" className="unit-pdf__open">
        Open the PDF in a new tab ↗
      </a>
    </div>
  );
}

function MarkComplete({
  credentialId,
  unitId,
  done,
}: {
  credentialId: string;
  unitId: string;
  done?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="unit-done" role="status">
        <span className="unit-done__check" aria-hidden="true">
          ✓
        </span>
        Completed — continue to the next lesson.
      </p>
    );
  }
  return (
    <div className="unit-actions">
      <button
        className="btn btn-lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await markUnitCompleteAction(credentialId, unitId);
            // Pin the URL to this unit so completing it doesn't auto-advance.
            router.replace(`/learn/${credentialId}?unit=${unitId}`);
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Mark complete"}
      </button>
    </div>
  );
}

function McqUnit({
  credentialId,
  unitId,
  data,
  locked,
  review,
}: {
  credentialId: string;
  unitId: string;
  data: unknown;
  locked: boolean;
  review: McqReview | null;
}) {
  const router = useRouter();
  const d = data as {
    passMark: number;
    questions: { id: string; text: string; options: { id: string; text: string }[] }[];
  };
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  // Submitted: show the outcome (score, pass mark, pass/fail) and the learner's
  // OWN answers.
  //
  // SECURITY (FCX-P1-002): the answer key is server-only. This view must never
  // identify which option was correct — no correctness marks, classes, tags,
  // aria-labels or data attributes. Options the learner did not choose are
  // rendered exactly like any other unchosen option.
  if (locked) {
    const passed = review?.passed ?? null;
    return (
      <div className="mcq mcq--review">
        <p className="mcq__score">
          Assessment submitted
          {review?.percentage != null ? ` — score ${review.percentage}%` : ""} (pass mark{" "}
          {d.passMark}%).
          {passed === true ? " Passed." : passed === false ? " Not passed." : ""} No further
          attempts.
        </p>
        {review &&
          d.questions.map((q, qi) => {
            const chosen = review.chosenByQuestion[q.id] ?? [];
            return (
              <fieldset key={q.id} className="mcq__q">
                <div className="mcq__legend">
                  <span className="mcq__num">{qi + 1}</span> {q.text}
                </div>
                <div className="mcq__options">
                  {q.options.map((o) => {
                    const isChosen = chosen.includes(o.id);
                    return (
                      <div
                        key={o.id}
                        className={`mcq__option mcq__option--review${
                          isChosen ? " mcq__option--chosen" : ""
                        }`}
                      >
                        <span className="mcq__mark" aria-hidden="true">
                          {isChosen ? "•" : ""}
                        </span>
                        <span>{o.text}</span>
                        {isChosen && <span className="mcq__tag">Your answer</span>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
      </div>
    );
  }

  return (
    <div className="mcq">
      {d.questions.map((q, qi) => (
        <fieldset key={q.id} className="mcq__q">
          <legend className="mcq__legend">
            <span className="mcq__num">{qi + 1}</span> {q.text}
          </legend>
          <div className="mcq__options">
            {q.options.map((o) => {
              const checked = answers[q.id]?.[0] === o.id;
              return (
                <label key={o.id} className={`mcq__option${checked ? " mcq__option--on" : ""}`}>
                  <input
                    type="radio"
                    name={q.id}
                    value={o.id}
                    checked={checked}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: [o.id] }))}
                  />
                  <span>{o.text}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="unit-actions">
        <button
          className="btn btn-lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await submitMcqAction(credentialId, unitId, answers);
              setResult(
                res.message + (res.percentage !== undefined ? ` (${res.percentage}%)` : ""),
              );
              // Stay on THIS quiz (pin the URL) so the review is visible; the
              // learner advances only with the Next button.
              router.replace(`/learn/${credentialId}?unit=${unitId}`);
              router.refresh();
            })
          }
        >
          {pending ? "Submitting…" : "Submit answers"}
        </button>
        {result && <p className="mcq__result">{result}</p>}
      </div>
    </div>
  );
}
