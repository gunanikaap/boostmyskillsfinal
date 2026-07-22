"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setMaintenanceAction } from "@/app/admin/actions";

export function MaintenanceToggle({
  initialEnabled,
  initialMessage,
}: {
  initialEnabled: boolean;
  initialMessage: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [savedMessage, setSavedMessage] = useState(initialMessage);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const dirty = message !== savedMessage;

  function toggle() {
    start(async () => {
      const next = !enabled;
      const res = await setMaintenanceAction(next, message);
      if (res.ok) {
        setEnabled(next);
        setSavedMessage(message);
      }
      setStatus(res.message);
    });
  }

  function saveMessage() {
    start(async () => {
      const res = await setMaintenanceAction(enabled, message);
      if (res.ok) setSavedMessage(message);
      setStatus(res.message);
    });
  }

  return (
    <div className="mnt">
      <div className={`mnt-status ${enabled ? "mnt-status--on" : "mnt-status--off"}`}>
        <span className="mnt-status__dot" aria-hidden="true" />
        <div className="mnt-status__text">
          <span className="mnt-status__label">Maintenance mode is</span>
          <span className="mnt-status__value">{enabled ? "ON" : "OFF"}</span>
        </div>
        <button className={enabled ? "btn" : "btn btn-danger"} onClick={toggle} disabled={pending}>
          {pending ? "Working…" : enabled ? "Disable maintenance" : "Enable maintenance"}
        </button>
      </div>

      {enabled && (
        <div className="admin-alert" role="status">
          The site is in maintenance. Everyone except admins is redirected to the maintenance page —
          only the home page and the sign-in page stay open.{" "}
          <Link href="/maintenance" target="_blank" rel="noopener noreferrer">
            Open the maintenance page ↗
          </Link>
        </div>
      )}

      <div className="mnt-field">
        <label htmlFor="mnt-msg">Message shown to learners</label>
        <textarea
          id="mnt-msg"
          className="account-input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="mnt-field__actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={saveMessage}
            disabled={pending || !dirty}
          >
            Save message
          </button>
          {dirty && <span className="admin-table__muted">Unsaved changes</span>}
        </div>
      </div>

      <div className="mnt-preview">
        <span className="mnt-preview__label">Learner preview</span>
        <div className="mnt-preview__card">
          <span className="mnt-preview__brand">BOOSTMYSKILLS</span>
          <strong className="mnt-preview__title">We&rsquo;ll be right back</strong>
          <span className="mnt-preview__msg">
            {message.trim() || "Your message will appear here."}
          </span>
        </div>
      </div>

      {status && <p className="admin-table__muted mnt__status-line">{status}</p>}
    </div>
  );
}
