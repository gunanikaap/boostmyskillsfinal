"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { EyeButton, clerkErrorMessage, safeNext } from "./authHelpers";

type View = "signin" | "reset-request" | "reset-code";

export default function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [view, setView] = useState<View>("signin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Password-reset flow
  const [resetEmail, setResetEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  function goTo(next: View) {
    setError("");
    setInfo("");
    setView(next);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setPending(true);
    try {
      const res = await signIn.create({ identifier, password });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        router.push(safeNext());
      } else {
        setError("Additional verification is required for this account.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setPending(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: resetEmail });
      setError("");
      setView("reset-code");
      setInfo(`We've emailed a reset code to ${resetEmail}.`);
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setPending(true);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        router.push(safeNext());
      } else {
        setError("Could not reset your password. Please check the code and try again.");
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  // ---- Reset: request a code -------------------------------------------------
  if (view === "reset-request") {
    return (
      <form className="auth-form" onSubmit={handleResetRequest} noValidate>
        <p className="auth-form__hint">
          Enter the email on your account and we&rsquo;ll send you a code to reset your password.
        </p>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            className="auth-input"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="Enter your email address"
            autoComplete="email"
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn auth-submit" disabled={pending || !isLoaded}>
          {pending ? "Sending…" : "Send reset code"}
        </button>
        <button type="button" className="auth-forgot auth-link" onClick={() => goTo("signin")}>
          Back to sign in
        </button>
      </form>
    );
  }

  // ---- Reset: enter code + new password --------------------------------------
  if (view === "reset-code") {
    return (
      <form className="auth-form" onSubmit={handleResetConfirm} noValidate>
        {info && <p className="auth-form__hint">{info}</p>}
        <label className="auth-field">
          <span>Reset code</span>
          <input
            className="auth-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label className="auth-field">
          <span>New password</span>
          <div className="auth-input-wrap">
            <input
              type={showNewPw ? "text" : "password"}
              className="auth-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Create a new password"
              autoComplete="new-password"
              required
            />
            <EyeButton shown={showNewPw} onToggle={() => setShowNewPw((v) => !v)} />
          </div>
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn auth-submit" disabled={pending || !isLoaded}>
          {pending ? "Resetting…" : "Reset password and sign in"}
        </button>
        <button type="button" className="auth-forgot auth-link" onClick={() => goTo("signin")}>
          Back to sign in
        </button>
      </form>
    );
  }

  // ---- Sign in ---------------------------------------------------------------
  return (
    <form className="auth-form" onSubmit={handleSignIn} noValidate>
      <label className="auth-field">
        <span>Username or email</span>
        <input
          className="auth-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Enter your username or email"
          autoComplete="username"
          required
        />
      </label>

      <label className="auth-field">
        <span>Password</span>
        <div className="auth-input-wrap">
          <input
            type={showPw ? "text" : "password"}
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
          <EyeButton shown={showPw} onToggle={() => setShowPw((v) => !v)} />
        </div>
      </label>

      {error && <p className="auth-error">{error}</p>}

      <button className="btn auth-submit" disabled={pending || !isLoaded}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <button type="button" className="auth-forgot auth-link" onClick={() => goTo("reset-request")}>
        Forgot password?
      </button>
    </form>
  );
}
