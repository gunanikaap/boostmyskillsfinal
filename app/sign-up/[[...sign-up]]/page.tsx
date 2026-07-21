import AuthShell from "@/components/AuthShell";
import AuthPanel from "@/components/auth/AuthPanel";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell>
      {clerkConfigured() ? (
        <AuthPanel initial="register" />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Registration is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}
