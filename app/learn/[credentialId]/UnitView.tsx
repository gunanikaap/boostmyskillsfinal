"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMcqAction, markUnitCompleteAction } from "./actions";
import type { UnitState } from "@/lib/learner/queries";

// The unit shape the player receives — NO correct answers are present.
export interface PlayerUnit {
  id: string;
  type: "video" | "reading" | "mcq";
  title: string;
  data: unknown;
}

export function UnitView({
  credentialId,
  unit,
  state,
}: {
  credentialId: string;
  unit: PlayerUnit;
  state?: UnitState;
}) {
  return (
    <div className="unit">
      {unit.type === "video" && <VideoUnit data={unit.data} />}
      {unit.type === "reading" && <ReadingUnit data={unit.data} />}
      {unit.type === "mcq" && (
        <McqUnit
          credentialId={credentialId}
          unitId={unit.id}
          data={unit.data}
          locked={Boolean(state?.attempted)}
          lastPercentage={state?.attemptPercentage ?? null}
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
  lastPercentage,
}: {
  credentialId: string;
  unitId: string;
  data: unknown;
  locked: boolean;
  lastPercentage: number | null;
}) {
  const router = useRouter();
  const d = data as {
    passMark: number;
    questions: { id: string; text: string; options: { id: string; text: string }[] }[];
  };
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (locked) {
    return (
      <p className="unit-done" role="status">
        <span className="unit-done__check" aria-hidden="true">
          ✓
        </span>
        Assessment submitted{lastPercentage !== null ? ` — score ${lastPercentage}%` : ""}. No
        further attempts.
      </p>
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
