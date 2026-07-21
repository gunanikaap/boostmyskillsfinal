import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import { authAppearance } from "@/lib/auth/clerkAppearance";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell active="signin">
      {clerkConfigured() ? (
        <SignIn appearance={authAppearance} />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Authentication is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}
