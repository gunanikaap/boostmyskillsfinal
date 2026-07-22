"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { COUNTRIES } from "@/lib/geo/countries";
import {
  GENDER_OPTIONS,
  EDUCATION_OPTIONS,
  LANGUAGE_OPTIONS,
  SITE_LANGUAGE_OPTIONS,
  TIME_ZONE_OPTIONS,
  PROFILE_KEYS,
  type AccountView,
  type AccountPatch,
  type DeletionRequest,
} from "@/lib/account/types";
import {
  saveAccountAction,
  requestDeletionAction,
  cancelDeletionAction,
  type AccountActionResult,
} from "./actions";

const SECTIONS = [
  { id: "account-information", label: "Account Information" },
  { id: "profile-information", label: "Profile Information" },
  { id: "social-media-links", label: "Social Media Links" },
  { id: "site-preferences", label: "Site Preferences" },
  { id: "linked-accounts", label: "Linked Accounts" },
  { id: "delete-account", label: "Delete My Account" },
];

function applyPatch(d: AccountView, patch: AccountPatch): AccountView {
  const next: AccountView = { ...d, profile: { ...d.profile } };
  if (patch.fullName !== undefined) next.fullName = patch.fullName.trim();
  if (patch.country !== undefined) next.country = patch.country.trim();
  if (patch.gender !== undefined) next.gender = patch.gender.trim();
  for (const k of PROFILE_KEYS) {
    if (patch[k] !== undefined) next.profile[k] = (patch[k] as string).trim();
  }
  return next;
}

export default function AccountSettings({
  view,
  deletion,
  clerkEnabled,
}: {
  view: AccountView;
  deletion: DeletionRequest | null;
  clerkEnabled: boolean;
}) {
  const [data, setData] = useState<AccountView>(view);
  const [active, setActive] = useState(SECTIONS[0]!.id);

  // Lightweight scroll-spy so the sidebar highlights the section in view.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el != null,
    );
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  async function commit(patch: AccountPatch): Promise<AccountActionResult> {
    const res = await saveAccountAction(patch);
    if (res.ok) setData((d) => applyPatch(d, patch));
    return res;
  }

  return (
    <main className="container account">
      <div className="page-head">
        <p className="crumb">
          <Link href="/dashboard">Dashboard</Link> / Account
        </p>
        <h1>Account settings</h1>
      </div>

      <div className="account-layout">
        <nav className="account-nav" aria-label="Account sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={active === s.id ? "is-active" : undefined}
              aria-current={active === s.id ? "true" : undefined}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="account-main">
          {/* -------- Account Information -------- */}
          <section id="account-information" className="account-section">
            <h2>Account Information</h2>
            <p className="account-section__intro">
              These settings include basic information about your account.
            </p>

            <ReadonlyField
              label="Username"
              value={data.username ?? "—"}
              note="The name that identifies you on BoostMySkills. You cannot change your username."
            />
            <EditableField
              label="Full name"
              field="fullName"
              value={data.fullName}
              emptyLabel="Add your full name"
              note="The name used for ID verification and that appears on your certificates."
              commit={commit}
            />
            <ReadonlyField
              label="Email address (Sign in)"
              value={data.email}
              note="You receive messages from BoostMySkills and course teams at this address."
            />
            <PasswordField clerkEnabled={clerkEnabled} />
            <EditableField
              label="Year of birth"
              field="yearOfBirth"
              value={data.profile.yearOfBirth}
              emptyLabel="Add year of birth"
              inputType="number"
              placeholder="e.g. 1998"
              commit={commit}
            />
            <EditableField
              label="Country"
              field="country"
              value={data.country}
              emptyLabel="Add country"
              options={COUNTRIES}
              commit={commit}
            />
          </section>

          {/* -------- Profile Information -------- */}
          <section id="profile-information" className="account-section">
            <h2>Profile Information</h2>
            <EditableField
              label="Education"
              field="education"
              value={data.profile.education}
              emptyLabel="Add level of education"
              options={EDUCATION_OPTIONS}
              commit={commit}
            />
            <EditableField
              label="Gender"
              field="gender"
              value={data.gender}
              emptyLabel="Add gender"
              options={GENDER_OPTIONS}
              commit={commit}
            />
            <EditableField
              label="Spoken language"
              field="spokenLanguage"
              value={data.profile.spokenLanguage}
              emptyLabel="Add a spoken language"
              options={LANGUAGE_OPTIONS}
              commit={commit}
            />
          </section>

          {/* -------- Social Media Links -------- */}
          <section id="social-media-links" className="account-section">
            <h2>Social Media Links</h2>
            <p className="account-section__intro">
              Optionally, link your personal accounts to the social media icons on your
              BoostMySkills profile.
            </p>
            <EditableField
              label="LinkedIn"
              field="linkedin"
              value={data.profile.linkedin}
              emptyLabel="Add LinkedIn profile"
              inputType="url"
              placeholder="https://www.linkedin.com/in/…"
              commit={commit}
            />
            <EditableField
              label="Facebook"
              field="facebook"
              value={data.profile.facebook}
              emptyLabel="Add Facebook profile"
              inputType="url"
              placeholder="https://www.facebook.com/…"
              commit={commit}
            />
            <EditableField
              label="Twitter"
              field="twitter"
              value={data.profile.twitter}
              emptyLabel="Add Twitter profile"
              inputType="url"
              placeholder="https://twitter.com/…"
              commit={commit}
            />
          </section>

          {/* -------- Site Preferences -------- */}
          <section id="site-preferences" className="account-section">
            <h2>Site Preferences</h2>
            <EditableField
              label="Site language"
              field="siteLanguage"
              value={data.profile.siteLanguage}
              emptyLabel="Set site language"
              options={SITE_LANGUAGE_OPTIONS}
              note="The language used throughout this site."
              commit={commit}
            />
            <EditableField
              label="Time zone"
              field="timeZone"
              value={data.profile.timeZone}
              emptyLabel="Set time zone"
              options={TIME_ZONE_OPTIONS}
              note="Course dates and deadlines are shown in this time zone."
              commit={commit}
            />
          </section>

          {/* -------- Linked Accounts -------- */}
          <section id="linked-accounts" className="account-section">
            <h2>Linked Accounts</h2>
            <p className="account-section__intro">
              You can link your identity accounts to simplify signing in to BoostMySkills.
            </p>
            <p className="account-muted">No accounts can be linked at this time.</p>
          </section>

          {/* -------- Delete My Account -------- */}
          <section id="delete-account" className="account-section account-section--danger">
            <h2>Delete My Account</h2>
            <DeleteAccount initial={deletion} />
          </section>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ fields */

function ReadonlyField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="account-field">
      <div className="account-field__head">
        <span className="account-field__label">{label}</span>
      </div>
      <p className="account-field__value">{value}</p>
      {note && <p className="account-field__note">{note}</p>}
    </div>
  );
}

function EditableField({
  label,
  field,
  value,
  emptyLabel,
  options,
  inputType = "text",
  placeholder,
  note,
  commit,
}: {
  label: string;
  field: keyof AccountPatch;
  value: string;
  emptyLabel: string;
  options?: readonly string[];
  inputType?: "text" | "number" | "url";
  placeholder?: string;
  note?: string;
  commit: (patch: AccountPatch) => Promise<AccountActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setDraft(value);
    setError("");
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await commit({ [field]: draft } as AccountPatch);
    setSaving(false);
    if (res.ok) setEditing(false);
    else setError(res.message);
  }

  return (
    <div className="account-field">
      <div className="account-field__head">
        <span className="account-field__label">{label}</span>
        {!editing && (
          <button type="button" className="account-edit" onClick={open}>
            <PencilIcon />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form className="account-edit-form" onSubmit={save}>
          {options ? (
            <select
              className="account-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            >
              <option value="">Select…</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="account-input"
              type={inputType}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          )}
          {error && <p className="account-error">{error}</p>}
          <div className="account-edit-actions">
            <button className="btn btn-sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : value.trim() ? (
        <p className="account-field__value">{value}</p>
      ) : (
        <button type="button" className="account-add" onClick={open}>
          {emptyLabel}
        </button>
      )}

      {!editing && note && <p className="account-field__note">{note}</p>}
    </div>
  );
}

/* -------------------------------------------------------------- password */

function PasswordField({ clerkEnabled }: { clerkEnabled: boolean }) {
  return (
    <div className="account-field">
      <div className="account-field__head">
        <span className="account-field__label">Password</span>
      </div>
      {clerkEnabled ? (
        <ClerkPasswordForm />
      ) : (
        <p className="account-field__value">
          <Link href="/sign-in">Reset your password</Link>
        </p>
      )}
    </div>
  );
}

function ClerkPasswordForm() {
  const { user, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !user) return;
    setSaving(true);
    setError("");
    try {
      await user.updatePassword({
        currentPassword: current,
        newPassword: next,
        signOutOfOtherSessions: true,
      });
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch (err) {
      const e2 = err as { errors?: { longMessage?: string; message?: string }[] };
      setError(
        e2?.errors?.[0]?.longMessage ??
          e2?.errors?.[0]?.message ??
          "Could not update your password.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="account-add" onClick={() => setOpen(true)}>
          Reset Password
        </button>
        {done && <p className="account-success">Your password has been updated.</p>}
      </div>
    );
  }

  return (
    <form className="account-edit-form" onSubmit={submit}>
      <input
        className="account-input"
        type="password"
        value={current}
        placeholder="Current password"
        autoComplete="current-password"
        onChange={(e) => setCurrent(e.target.value)}
        required
      />
      <input
        className="account-input"
        type="password"
        value={next}
        placeholder="New password"
        autoComplete="new-password"
        onChange={(e) => setNext(e.target.value)}
        required
      />
      {error && <p className="account-error">{error}</p>}
      <div className="account-edit-actions">
        <button className="btn btn-sm" disabled={saving}>
          {saving ? "Updating…" : "Update password"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- delete account */

function DeleteAccount({ initial }: { initial: DeletionRequest | null }) {
  const [request, setRequest] = useState<DeletionRequest | null>(initial);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pending = request?.status === "pending";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await requestDeletionAction(reason);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      setRequest({
        id: "pending",
        status: "pending",
        reason: reason.trim() || null,
        adminNote: null,
        requestedAt: new Date().toISOString(),
        resolvedAt: null,
      });
    } else {
      setError(res.message);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError("");
    const res = await cancelDeletionAction();
    setBusy(false);
    if (res.ok) setRequest(null);
    else setError(res.message);
  }

  if (pending) {
    return (
      <div className="account-delete">
        <div className="account-delete__pending" role="status">
          <strong>Deletion requested — awaiting administrator approval.</strong>
          <p>
            An administrator has been notified and will review your request. Your account stays
            active until it is approved. You can withdraw the request below.
          </p>
        </div>
        {error && <p className="account-error">{error}</p>}
        <button type="button" className="btn btn-outline" onClick={withdraw} disabled={busy}>
          {busy ? "Withdrawing…" : "Withdraw request"}
        </button>
      </div>
    );
  }

  return (
    <div className="account-delete">
      <p>We&rsquo;re sorry to see you go!</p>
      <p>
        Please note: deletion of your account and personal data is permanent and cannot be undone.
        Once approved, you will not be able to use it to take courses on BoostMySkills, and you may
        lose access to verified certificates.
      </p>
      <p className="account-delete__warn">
        Account deletion requires administrator approval. When you submit a request, an
        administrator is notified and must approve it before your account is closed.
      </p>

      {confirming ? (
        <form className="account-delete__form" onSubmit={submit}>
          <label className="account-field__label" htmlFor="del-reason">
            Reason (optional)
          </label>
          <textarea
            id="del-reason"
            className="account-input"
            rows={3}
            value={reason}
            placeholder="Let the administrator know why you're leaving (optional)"
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="account-error">{error}</p>}
          <div className="account-edit-actions">
            <button className="btn btn-danger" disabled={busy}>
              {busy ? "Submitting…" : "Yes, request deletion"}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className="account-error">{error}</p>}
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            Delete My Account
          </button>
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
