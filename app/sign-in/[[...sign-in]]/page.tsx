import AuthShell from "@/components/AuthShell";
import AuthPanel from "@/components/auth/AuthPanel";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell>
      {clerkConfigured() ? (
        <AuthPanel initial="signin" />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Authentication is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}
