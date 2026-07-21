import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import { authAppearance } from "@/lib/auth/clerkAppearance";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell active="register">
      {clerkConfigured() ? (
        <SignUp appearance={authAppearance} />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Registration is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}
