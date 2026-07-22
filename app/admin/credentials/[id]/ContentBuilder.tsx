"use client";

import { useState, useTransition } from "react";
import {
  assembleDocuments,
  certificationRule,
  newId,
  youtubeIdFromUrl,
  type BuilderState,
  type BuilderSection,
  type BuilderSubsection,
  type BuilderUnit,
} from "@/lib/admin/builder/model";
import { saveDraftContentAction, validateDraftAction } from "@/app/admin/actions";

// Immutable helpers -----------------------------------------------------------
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

const btnSm: React.CSSProperties = { padding: "4px 10px", fontSize: 13 };
const ghost: React.CSSProperties = {
  ...btnSm,
  background: "transparent",
  color: "var(--bms-green-dark)",
  border: "1px solid var(--bms-border)",
};

export function ContentBuilder({
  credentialId,
  editable,
  initial,
}: {
  credentialId: string;
  editable: boolean;
  initial: BuilderState;
}) {
  const [state, setState] = useState<BuilderState>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const setSections = (fn: (s: BuilderSection[]) => BuilderSection[]) =>
    setState((st) => ({ ...st, sections: fn(st.sections) }));

  function updateSection(si: number, patch: Partial<BuilderSection>) {
    setSections((secs) => secs.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }
  function updateSub(si: number, ssi: number, patch: Partial<BuilderSubsection>) {
    setSections((secs) =>
      secs.map((s, i) =>
        i === si
          ? {
              ...s,
              subsections: s.subsections.map((ss, j) => (j === ssi ? { ...ss, ...patch } : ss)),
            }
          : s,
      ),
    );
  }
  function updateUnit(si: number, ssi: number, ui: number, unit: BuilderUnit) {
    setSections((secs) =>
      secs.map((s, i) =>
        i === si
          ? {
              ...s,
              subsections: s.subsections.map((ss, j) =>
                j === ssi ? { ...ss, units: ss.units.map((u, k) => (k === ui ? unit : u)) } : ss,
              ),
            }
          : s,
      ),
    );
  }
  const confirmRemove = (what: string) =>
    window.confirm(`Remove ${what}? This affects the draft only.`);

  async function save() {
    const { content, grading } = assembleDocuments(state);
    const rule = certificationRule(state);
    setMsg(null);
    setIssues(null);
    const res = await saveDraftContentAction(credentialId, {
      content,
      grading,
      certificationRule: rule,
    });
    setMsg(res.message);
    if (res.ok) {
      const v = await validateDraftAction(credentialId);
      setIssues(v.ok ? [] : v.issues);
    }
  }

  if (!editable) {
    return (
      <div className="card" role="status">
        This revision is published/read-only. Use <strong>Create draft changes</strong> to edit a
        new draft (published content is immutable).
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Content builder</h3>
        <button className="btn" disabled={pending} onClick={() => start(save)} aria-busy={pending}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button
          style={ghost}
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const v = await validateDraftAction(credentialId);
              setIssues(v.ok ? [] : v.issues);
              setMsg(
                v.ok
                  ? "Draft is valid and ready to publish."
                  : "Draft has validation issues (see summary).",
              );
            })
          }
        >
          Check readiness
        </button>
        <button
          style={ghost}
          className="btn"
          onClick={() =>
            setSections((s) => [
              ...s,
              { id: newId("s"), title: "New section", sourceKey: null, subsections: [] },
            ])
          }
        >
          + Add section
        </button>
      </div>

      {msg && (
        <div className="card" role="status" style={{ background: "#f3faf6" }}>
          {msg}
        </div>
      )}
      {issues && (
        <div className="card" style={{ borderColor: issues.length ? "#a15" : "var(--bms-green)" }}>
          <strong>Validation summary:</strong>{" "}
          {issues.length === 0 ? "✓ ready to publish" : `${issues.length} issue(s)`}
          {issues.length > 0 && (
            <ul style={{ margin: "8px 0 0" }}>
              {issues.map((iss, i) => (
                <li key={i} style={{ color: "#a15" }}>
                  {iss}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.sections.length === 0 && (
        <p style={{ color: "var(--bms-muted)" }}>
          No sections yet. Add a section to begin authoring.
        </p>
      )}

      {state.sections.map((sec, si) => (
        <section key={sec.id} className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              aria-label="Section title"
              value={sec.title}
              onChange={(e) => updateSection(si, { title: e.target.value })}
              style={{ fontWeight: 700, flex: "1 1 240px" }}
            />
            <button
              style={ghost}
              className="btn"
              onClick={() => setSections((s) => move(s, si, -1))}
              aria-label="Move section up"
            >
              ↑
            </button>
            <button
              style={ghost}
              className="btn"
              onClick={() => setSections((s) => move(s, si, 1))}
              aria-label="Move section down"
            >
              ↓
            </button>
            <button
              style={ghost}
              className="btn"
              onClick={() =>
                confirmRemove("this section") && setSections((s) => s.filter((_, i) => i !== si))
              }
            >
              Remove
            </button>
          </div>

          {sec.subsections.map((ss, ssi) => (
            <div
              key={ss.id}
              style={{
                border: "1px solid var(--bms-border)",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  aria-label="Subsection title"
                  value={ss.title}
                  onChange={(e) => updateSub(si, ssi, { title: e.target.value })}
                  style={{ flex: "1 1 200px" }}
                />
                <button
                  style={ghost}
                  className="btn"
                  onClick={() => updateSection(si, { subsections: move(sec.subsections, ssi, -1) })}
                  aria-label="Move subsection up"
                >
                  ↑
                </button>
                <button
                  style={ghost}
                  className="btn"
                  onClick={() => updateSection(si, { subsections: move(sec.subsections, ssi, 1) })}
                  aria-label="Move subsection down"
                >
                  ↓
                </button>
                <button
                  style={ghost}
                  className="btn"
                  onClick={() =>
                    confirmRemove("this subsection") &&
                    updateSection(si, { subsections: sec.subsections.filter((_, i) => i !== ssi) })
                  }
                >
                  Remove
                </button>
              </div>

              {ss.units.map((u, ui) => (
                <UnitEditor
                  key={u.id}
                  unit={u}
                  onChange={(nu) => updateUnit(si, ssi, ui, nu)}
                  onUp={() => updateSub(si, ssi, { units: move(ss.units, ui, -1) })}
                  onDown={() => updateSub(si, ssi, { units: move(ss.units, ui, 1) })}
                  onRemove={() =>
                    confirmRemove(`unit "${u.title}"`) &&
                    updateSub(si, ssi, { units: ss.units.filter((_, i) => i !== ui) })
                  }
                />
              ))}

              <AddUnit
                onAdd={(type) => updateSub(si, ssi, { units: [...ss.units, blankUnit(type)] })}
              />
            </div>
          ))}

          <button
            style={ghost}
            className="btn"
            onClick={() =>
              updateSection(si, {
                subsections: [
                  ...sec.subsections,
                  { id: newId("ss"), title: "New subsection", sourceKey: null, units: [] },
                ],
              })
            }
          >
            + Add subsection
          </button>
        </section>
      ))}

      <CertificationEditor
        state={state}
        onChange={(c) => setState((st) => ({ ...st, certification: c }))}
      />

      <details
        style={{ marginTop: 8 }}
        open={showRaw}
        onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: "pointer", color: "var(--bms-muted)" }}>
          Advanced: assembled JSON (read-only, debug)
        </summary>
        {showRaw && (
          <pre
            style={{
              overflow: "auto",
              fontSize: 12,
              background: "#0d1f17",
              color: "#cde",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {JSON.stringify(assembleDocuments(state), null, 2)}
          </pre>
        )}
      </details>
    </div>
  );
}

function blankUnit(type: "video" | "reading" | "pdf" | "mcq"): BuilderUnit {
  const base = { id: newId("u"), title: "New unit", required: true, sourceKey: null };
  if (type === "video") return { ...base, type, data: {} };
  if (type === "reading") return { ...base, type, data: { html: "" } };
  if (type === "pdf") return { ...base, type, data: {} };
  return {
    ...base,
    type: "mcq",
    data: {
      passMark: 50,
      questions: [
        {
          id: newId("q"),
          text: "New question",
          points: 1,
          options: [
            { id: newId("o"), text: "Option 1", correct: true },
            { id: newId("o"), text: "Option 2", correct: false },
          ],
        },
      ],
    },
  };
}

function AddUnit({ onAdd }: { onAdd: (t: "video" | "reading" | "pdf" | "mcq") => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ color: "var(--bms-muted)", fontSize: 13 }}>Add unit:</span>
      {(["video", "reading", "pdf", "mcq"] as const).map((t) => (
        <button key={t} style={ghost} className="btn" onClick={() => onAdd(t)}>
          + {t.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function UnitEditor({
  unit,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  unit: BuilderUnit;
  onChange: (u: BuilderUnit) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--bms-border)",
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bms-green)", minWidth: 54 }}>
          {unit.type.toUpperCase()}
        </span>
        <input
          aria-label="Unit title"
          value={unit.title}
          onChange={(e) => onChange({ ...unit, title: e.target.value })}
          style={{ flex: "1 1 180px" }}
        />
        <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={unit.required}
            onChange={(e) => onChange({ ...unit, required: e.target.checked })}
          />{" "}
          required
        </label>
        <button style={ghost} className="btn" onClick={onUp} aria-label="Move unit up">
          ↑
        </button>
        <button style={ghost} className="btn" onClick={onDown} aria-label="Move unit down">
          ↓
        </button>
        <button style={ghost} className="btn" onClick={onRemove}>
          Remove
        </button>
      </div>
      {unit.type === "video" && <VideoFields unit={unit} onChange={onChange} />}
      {unit.type === "reading" && <ReadingFields unit={unit} onChange={onChange} />}
      {unit.type === "pdf" && <PdfFields unit={unit} onChange={onChange} />}
      {unit.type === "mcq" && <McqFields unit={unit} onChange={onChange} />}
    </div>
  );
}

function VideoFields({
  unit,
  onChange,
}: {
  unit: Extract<BuilderUnit, { type: "video" }>;
  onChange: (u: BuilderUnit) => void;
}) {
  const [raw, setRaw] = useState(unit.data.youtubeId ?? "");
  const id = youtubeIdFromUrl(raw);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        aria-label="YouTube URL or ID"
        placeholder="YouTube URL or 11-char video ID"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const yid = youtubeIdFromUrl(e.target.value);
          onChange({ ...unit, data: yid ? { youtubeId: yid } : {} });
        }}
      />
      {raw && !id && (
        <span style={{ color: "#a15", fontSize: 13 }}>Not a recognised YouTube URL/ID.</span>
      )}
      {id && (
        <div style={{ position: "relative", paddingTop: "40%", maxWidth: 360 }}>
          <iframe
            title="preview"
            src={`https://www.youtube.com/embed/${id}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function ReadingFields({
  unit,
  onChange,
}: {
  unit: Extract<BuilderUnit, { type: "reading" }>;
  onChange: (u: BuilderUnit) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <textarea
        aria-label="Reading content (HTML)"
        rows={5}
        value={unit.data.html}
        onChange={(e) => onChange({ ...unit, data: { html: e.target.value } })}
        placeholder="Formatted text / safe HTML — sanitised server-side (no scripts/handlers)."
      />
      <details>
        <summary style={{ cursor: "pointer", color: "var(--bms-muted)", fontSize: 13 }}>
          Learner preview
        </summary>
        <div className="card" dangerouslySetInnerHTML={{ __html: unit.data.html }} />
      </details>
    </div>
  );
}

function PdfFields({
  unit,
  onChange,
}: {
  unit: Extract<BuilderUnit, { type: "pdf" }>;
  onChange: (u: BuilderUnit) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        aria-label="PDF URL"
        placeholder="Link to a PDF (https://…/document.pdf)"
        value={unit.data.url ?? ""}
        onChange={(e) => onChange({ ...unit, data: { ...unit.data, url: e.target.value } })}
      />
      <input
        aria-label="PDF display name"
        placeholder="Display name (optional)"
        value={unit.data.filename ?? ""}
        onChange={(e) => onChange({ ...unit, data: { ...unit.data, filename: e.target.value } })}
      />
      {unit.data.url && (
        <div style={{ height: 320, marginTop: 4 }}>
          <iframe
            title="PDF preview"
            src={unit.data.url}
            style={{
              width: "100%",
              height: "100%",
              border: "1px solid var(--bms-border)",
              borderRadius: 8,
            }}
          />
        </div>
      )}
    </div>
  );
}

function McqFields({
  unit,
  onChange,
}: {
  unit: Extract<BuilderUnit, { type: "mcq" }>;
  onChange: (u: BuilderUnit) => void;
}) {
  const d = unit.data;
  const setQ = (qi: number, patch: Partial<(typeof d.questions)[number]>) =>
    onChange({
      ...unit,
      data: { ...d, questions: d.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) },
    });
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontSize: 13 }}>
        Pass mark %:{" "}
        <input
          type="number"
          min={0}
          max={100}
          value={d.passMark}
          onChange={(e) => onChange({ ...unit, data: { ...d, passMark: Number(e.target.value) } })}
          style={{ width: 70 }}
        />
        <span style={{ color: "var(--bms-muted)" }}> · max attempts: 1 (fixed this release)</span>
      </label>
      {d.questions.map((q, qi) => (
        <fieldset key={q.id} style={{ border: "1px solid var(--bms-border)", borderRadius: 8 }}>
          <legend style={{ fontSize: 12 }}>Question {qi + 1}</legend>
          <input
            aria-label="Question text"
            value={q.text}
            onChange={(e) => setQ(qi, { text: e.target.value })}
            style={{ width: "100%", marginBottom: 6 }}
          />
          {q.options.map((o, oi) => (
            <label
              key={o.id}
              style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}
            >
              <input
                type="checkbox"
                checked={o.correct}
                onChange={(e) =>
                  setQ(qi, {
                    options: q.options.map((x, i) =>
                      i === oi ? { ...x, correct: e.target.checked } : x,
                    ),
                  })
                }
                aria-label="Correct answer"
              />
              <input
                aria-label="Option text"
                value={o.text}
                onChange={(e) =>
                  setQ(qi, {
                    options: q.options.map((x, i) =>
                      i === oi ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
                style={{ flex: 1 }}
              />
              {q.options.length > 2 && (
                <button
                  style={ghost}
                  className="btn"
                  onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi) })}
                >
                  ×
                </button>
              )}
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              style={ghost}
              className="btn"
              onClick={() =>
                setQ(qi, {
                  options: [
                    ...q.options,
                    { id: newId("o"), text: `Option ${q.options.length + 1}`, correct: false },
                  ],
                })
              }
            >
              + option
            </button>
            {d.questions.length > 1 && (
              <button
                style={ghost}
                className="btn"
                onClick={() =>
                  onChange({
                    ...unit,
                    data: { ...d, questions: d.questions.filter((_, i) => i !== qi) },
                  })
                }
              >
                remove question
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <button
        style={ghost}
        className="btn"
        onClick={() =>
          onChange({
            ...unit,
            data: {
              ...d,
              questions: [
                ...d.questions,
                {
                  id: newId("q"),
                  text: "New question",
                  points: 1,
                  options: [
                    { id: newId("o"), text: "Option 1", correct: true },
                    { id: newId("o"), text: "Option 2", correct: false },
                  ],
                },
              ],
            },
          })
        }
      >
        + Add question
      </button>
    </div>
  );
}

function CertificationEditor({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (c: BuilderState["certification"]) => void;
}) {
  const units = state.sections.flatMap((s) =>
    s.subsections.flatMap((ss) =>
      ss.units.map((u) => ({ id: u.id, title: u.title, type: u.type })),
    ),
  );
  const required = new Set(state.certification.requiredUnitIds);
  const toggle = (unitId: string, on: boolean) => {
    const next = new Set(required);
    if (on) next.add(unitId);
    else next.delete(unitId);
    onChange({ ...state.certification, requiredUnitIds: [...next] });
  };
  return (
    <div className="card" style={{ display: "grid", gap: 6 }}>
      <h3 style={{ margin: 0 }}>Certification rule</h3>
      <label style={{ fontSize: 14 }}>
        Threshold %:{" "}
        <input
          type="number"
          min={0}
          max={100}
          value={state.certification.thresholdPercent}
          onChange={(e) =>
            onChange({ ...state.certification, thresholdPercent: Number(e.target.value) })
          }
          style={{ width: 70 }}
        />
      </label>
      <fieldset style={{ border: "1px solid var(--bms-border)", borderRadius: 8, margin: 0 }}>
        <legend style={{ fontSize: 13 }}>Required for certification</legend>
        {units.length === 0 ? (
          <p style={{ color: "var(--bms-muted)", margin: 0, fontSize: 13 }}>Add units first.</p>
        ) : (
          units.map((u) => (
            <label key={u.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                aria-label={`Require "${u.title}" for certification`}
                checked={required.has(u.id)}
                onChange={(e) => toggle(u.id, e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                {u.title} <em style={{ color: "var(--bms-muted)" }}>({u.type})</em>
              </span>
            </label>
          ))
        )}
      </fieldset>
      <p style={{ color: "var(--bms-muted)", margin: 0, fontSize: 13 }}>
        A learner is certified when their result reaches the threshold (UAT default 50%) AND every
        unit ticked above is completed. With none ticked, only the threshold applies.
      </p>
    </div>
  );
}
