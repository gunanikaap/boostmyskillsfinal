"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { EyeButton, clerkErrorMessage, isSessionExistsError, safeNext } from "./authHelpers";
import { COUNTRIES } from "@/lib/geo/countries";

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

export default function SignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [agree, setAgree] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    if (!agree) {
      setError("Please read and accept the Terms and Conditions to continue.");
      return;
    }
    setPending(true);
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts.shift() ?? "";
    const lastName = parts.join(" ");
    try {
      await signUp.create({
        username,
        emailAddress: email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        // Country + gender aren't standard Clerk fields, so we persist them on the
        // Clerk user's metadata (synced into app_users by syncAppUser).
        unsafeMetadata: { country, gender },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifying(true);
    } catch (err) {
      if (isSessionExistsError(err)) {
        router.push(safeNext());
        return;
      }
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setPending(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        router.push(safeNext());
      } else {
        setError("Could not complete verification. Please check the code and try again.");
      }
    } catch (err) {
      if (isSessionExistsError(err)) {
        router.push(safeNext());
        return;
      }
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (verifying) {
    return (
      <form className="auth-form" onSubmit={handleVerify} noValidate>
        <p className="auth-form__hint">
          We&rsquo;ve sent a verification code to <strong>{email}</strong>. Enter it below to finish
          creating your account.
        </p>
        <label className="auth-field">
          <span>Verification code</span>
          <input
            className="auth-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="btn auth-submit" disabled={pending}>
          {pending ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="auth-field">
        <span>Full name</span>
        <input
          className="auth-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
          required
        />
        <small className="auth-field__note">
          This is the name that will appear on your certificate.
        </small>
      </label>

      <label className="auth-field">
        <span>Username</span>
        <input
          className="auth-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a username"
          autoComplete="username"
          required
        />
      </label>

      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          autoComplete="email"
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
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
          <EyeButton shown={showPw} onToggle={() => setShowPw((v) => !v)} />
        </div>
      </label>

      <label className="auth-field">
        <span>Country of residence</span>
        <select
          className="auth-input auth-select"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
        >
          <option value="" disabled>
            Select your country
          </option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="auth-field">
        <span>Gender</span>
        <select
          className="auth-input auth-select"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          required
        >
          <option value="" disabled>
            Select…
          </option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      <label className="auth-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          I have read and agree to the{" "}
          <Link href="/terms" target="_blank" rel="noopener noreferrer">
            Terms and Conditions
          </Link>
        </span>
      </label>

      {error && <p className="auth-error">{error}</p>}

      {/* Clerk bot-protection widget mounts here when enabled on the instance. */}
      <div id="clerk-captcha" />

      <button className="btn auth-submit" disabled={pending || !isLoaded}>
        {pending ? "Creating your account…" : "Create an account for free"}
      </button>
    </form>
  );
}
