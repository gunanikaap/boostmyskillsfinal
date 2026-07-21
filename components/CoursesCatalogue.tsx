"use client";

import { useMemo, useState } from "react";
import { CredentialCard, type CredentialCardData } from "@/components/CatalogueCards";

interface Item extends CredentialCardData {
  projectName: string;
}

/**
 * Micro-credentials catalogue: a results grid plus a "Refine Your Search"
 * sidebar (free-text search + Project and Organisation filters), mirroring the
 * live boostmyskills.eu/courses layout. All filtering is client-side.
 */
export default function CoursesCatalogue({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [org, setOrg] = useState("");

  const projects = useMemo(
    () => [...new Set(items.map((i) => i.projectName).filter(Boolean))].sort(),
    [items],
  );
  const orgs = useMemo(
    () => [...new Set(items.map((i) => i.organisationName).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((c) => {
      if (project && c.projectName !== project) return false;
      if (org && c.organisationName !== org) return false;
      if (
        needle &&
        ![c.title, c.code, c.organisationName, c.projectName]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [q, project, org, items]);

  const hasFilters = Boolean(q || project || org);

  return (
    <div className="container catalogue-layout">
      <div className="catalogue-main">
        <p className="catalogue-count">
          Viewing {filtered.length}{" "}
          {filtered.length === 1 ? "micro-credential" : "micro-credentials"}
        </p>
        {filtered.length === 0 ? (
          <div className="empty-state">
            No micro-credentials match your search. Try adjusting the filters.
          </div>
        ) : (
          <div className="catalogue-grid catalogue-grid--main">
            {filtered.map((c, i) => (
              <CredentialCard key={c.slug} c={c} i={i} />
            ))}
          </div>
        )}
      </div>

      <aside className="catalogue-filters" aria-label="Refine your search">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search micro-credentials"
            placeholder="Search for a course"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="filter-panel">
          <h3>Refine Your Search</h3>
          <div className="filter-field">
            <label htmlFor="filter-project">Project</label>
            <select
              id="filter-project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <label htmlFor="filter-org">Organisation</label>
            <select id="filter-org" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">All organisations</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setQ("");
                setProject("");
                setOrg("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
