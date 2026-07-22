"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Analytics filter bar. Prop types are declared structurally (not imported from
 * the pg-backed analytics module) so this client component never pulls the
 * database into the browser bundle. Changing any control re-navigates with the
 * new query string; the server page recomputes the table, the summary and the
 * export link from those params.
 */
type Options = {
  learners: { id: string; name: string }[];
  organisations: string[];
  projects: { id: string; name: string }[];
  programmes: { id: string; title: string }[];
  credentials: { id: string; label: string }[];
};

type Current = {
  userId?: string;
  organisation?: string;
  projectId?: string;
  programmeId?: string;
  credentialId?: string;
  from?: string;
  to?: string;
};

export default function AnalyticsFilters({
  options,
  current,
}: {
  options: Options;
  current: Current;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function apply() {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) {
      const s = String(v).trim();
      if (s) params.set(k, s);
    }
    const qs = params.toString();
    router.push(qs ? `/admin/analytics?${qs}` : "/admin/analytics");
  }

  function reset() {
    formRef.current?.reset();
    router.push("/admin/analytics");
  }

  const active =
    current.userId ||
    current.organisation ||
    current.projectId ||
    current.programmeId ||
    current.credentialId ||
    current.from ||
    current.to;

  return (
    <form
      ref={formRef}
      className="admin-filters"
      onChange={apply}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="admin-filters__field">
        <span>Learner</span>
        <select name="userId" defaultValue={current.userId ?? ""} className="account-input">
          <option value="">All learners</option>
          {options.learners.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-filters__field">
        <span>Organisation</span>
        <select
          name="organisation"
          defaultValue={current.organisation ?? ""}
          className="account-input"
        >
          <option value="">All organisations</option>
          {options.organisations.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-filters__field">
        <span>Project</span>
        <select name="projectId" defaultValue={current.projectId ?? ""} className="account-input">
          <option value="">All projects</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-filters__field">
        <span>Micro-programme</span>
        <select
          name="programmeId"
          defaultValue={current.programmeId ?? ""}
          className="account-input"
        >
          <option value="">All micro-programmes</option>
          {options.programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-filters__field">
        <span>Micro-credential</span>
        <select
          name="credentialId"
          defaultValue={current.credentialId ?? ""}
          className="account-input"
        >
          <option value="">All micro-credentials</option>
          {options.credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-filters__field">
        <span>Enrolled from</span>
        <input
          type="date"
          name="from"
          defaultValue={current.from ?? ""}
          className="account-input"
        />
      </label>

      <label className="admin-filters__field">
        <span>Enrolled to</span>
        <input type="date" name="to" defaultValue={current.to ?? ""} className="account-input" />
      </label>

      <div className="admin-filters__actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={!active}>
          Reset filters
        </button>
      </div>
    </form>
  );
}
