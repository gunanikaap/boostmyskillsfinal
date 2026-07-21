"use client";

import { useState } from "react";
import SignInForm from "./SignInForm";
import SignUpForm from "./SignUpForm";

type Mode = "register" | "signin";

/**
 * Register / Sign in toggle + form, switched entirely on the client (no route
 * navigation) so the transition is smooth: a sliding pill animates under the
 * active tab and the form cross-fades. The URL is kept in sync via
 * history.replaceState so a refresh / share still lands on the right mode.
 */
export default function AuthPanel({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);

  function switchTo(next: Mode) {
    if (next === mode) return;
    setMode(next);
    if (typeof window !== "undefined") {
      const path = next === "register" ? "/sign-up" : "/sign-in";
      window.history.replaceState(null, "", path + window.location.search);
    }
  }

  return (
    <>
      <div className="auth__toggle" role="tablist" aria-label="Register or sign in">
        <span className={`auth__toggle-pill auth__toggle-pill--${mode}`} aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`auth__tab${mode === "register" ? " auth__tab--active" : ""}`}
          onClick={() => switchTo("register")}
        >
          Register
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={`auth__tab${mode === "signin" ? " auth__tab--active" : ""}`}
          onClick={() => switchTo("signin")}
        >
          Sign in
        </button>
      </div>

      <div key={mode} className="auth__fade">
        {mode === "register" ? <SignUpForm /> : <SignInForm />}
      </div>
    </>
  );
}
