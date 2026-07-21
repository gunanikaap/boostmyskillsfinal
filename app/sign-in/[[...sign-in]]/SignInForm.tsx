"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { EyeButton, clerkErrorMessage, safeNext } from "./authHelpers";

export default function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
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

      <Link href="/sign-up" className="auth-forgot">
        New here? Create an account
      </Link>
    </form>
  );
}
