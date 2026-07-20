"use client";

import { useState, useTransition } from "react";
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
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0 }}>{unit.title}</h4>
        <span
          style={{ color: state?.status === "completed" ? "var(--bms-green)" : "var(--bms-muted)" }}
        >
          {state?.status === "completed" ? "✓ completed" : (state?.status ?? "not started")}
        </span>
      </div>
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
      <div style={{ position: "relative", paddingTop: "56.25%", marginTop: 10 }}>
        <iframe
          title="video"
          src={`https://www.youtube.com/embed/${encodeURIComponent(d.youtubeId)}`}
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }
  return <p style={{ color: "var(--bms-muted)" }}>Media: {d.mediaObjectKey ?? "unavailable"}</p>;
}

function ReadingUnit({ data }: { data: unknown }) {
  const d = data as { html?: string };
  // html was sanitised server-side at authoring time.
  return <div style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: d.html ?? "" }} />;
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
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (done) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => setMsg((await markUnitCompleteAction(credentialId, unitId)).message))
        }
      >
        Mark complete
      </button>
      {msg && <span style={{ marginLeft: 10, color: "var(--bms-muted)" }}>{msg}</span>}
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
  const d = data as {
    passMark: number;
    questions: { id: string; text: string; options: { id: string; text: string }[] }[];
  };
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (locked) {
    return (
      <p style={{ marginTop: 10, color: "var(--bms-muted)" }}>
        Assessment submitted{lastPercentage !== null ? ` — score ${lastPercentage}%` : ""}. No
        further attempts.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {d.questions.map((q) => (
        <fieldset
          key={q.id}
          style={{ border: "1px solid var(--bms-border)", borderRadius: 8, marginBottom: 10 }}
        >
          <legend>{q.text}</legend>
          {q.options.map((o) => (
            <label key={o.id} style={{ display: "block", padding: "4px 0" }}>
              <input
                type="radio"
                name={q.id}
                value={o.id}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: [o.id] }))}
              />{" "}
              {o.text}
            </label>
          ))}
        </fieldset>
      ))}
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await submitMcqAction(credentialId, unitId, answers);
            setResult(res.message + (res.percentage !== undefined ? ` (${res.percentage}%)` : ""));
          })
        }
      >
        Submit answers
      </button>
      {result && <p style={{ marginTop: 8 }}>{result}</p>}
    </div>
  );
}
