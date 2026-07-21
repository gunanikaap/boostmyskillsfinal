import Link from "next/link";
import Image from "next/image";

/**
 * Two-panel authentication layout mirroring apps.boostmyskills.eu: a soft-green
 * page with brand messaging on the left and a white card on the right. The card
 * holds the Register / Sign in toggle + form (AuthPanel), passed as children.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
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

        <div className="auth__card">{children}</div>
      </div>
    </div>
  );
}
