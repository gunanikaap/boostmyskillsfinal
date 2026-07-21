import Link from "next/link";
import Image from "next/image";

/**
 * Two-panel authentication layout mirroring apps.boostmyskills.eu: a soft-green
 * page with brand messaging on the left and a white card (Register / Sign in
 * toggle + the embedded Clerk form) on the right.
 */
export default function AuthShell({
  active,
  children,
}: {
  active: "register" | "signin";
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth__inner">
        <div className="auth__brand">
          <Link href="/" aria-label="BoostMySkills home" className="auth__logo">
            <Image
              src="/brand/logo.png"
              alt="BoostMySkills"
              width={200}
              height={102}
              style={{ width: 176, height: "auto" }}
            />
          </Link>
          <h1>Start learning with BoostMySkills</h1>
          <p>100% free. No credit card needed.</p>
        </div>

        <div className="auth__card">
          <div className="auth__toggle">
            <Link
              href="/sign-up"
              className={`auth__tab${active === "register" ? " auth__tab--active" : ""}`}
              aria-current={active === "register" ? "page" : undefined}
            >
              Register
            </Link>
            <Link
              href="/sign-in"
              className={`auth__tab${active === "signin" ? " auth__tab--active" : ""}`}
              aria-current={active === "signin" ? "page" : undefined}
            >
              Sign in
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
