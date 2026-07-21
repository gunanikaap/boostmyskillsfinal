"use client";

import { useMemo, useState } from "react";
import { CredentialCard, type CredentialCardData } from "@/components/CatalogueCards";

interface Item extends CredentialCardData {
  projectName: string;
}

/** Micro-credentials catalogue with client-side search over title/code/org/project. */
export default function CoursesCatalogue({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((c) =>
      [c.title, c.code, c.organisationName, c.projectName].join(" ").toLowerCase().includes(needle),
    );
  }, [q, items]);

  return (
    <div className="container">
      <div className="catalogue-toolbar">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search micro-credentials"
            placeholder="Search by title, code or organisation"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          No micro-credentials match &ldquo;{q}&rdquo;. Try a different search.
        </div>
      ) : (
        <div className="catalogue-grid">
          {filtered.map((c, i) => (
            <CredentialCard key={c.slug} c={c} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}
