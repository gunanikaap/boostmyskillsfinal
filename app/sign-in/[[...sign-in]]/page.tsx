import AuthShell from "@/components/AuthShell";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import SignInForm from "./SignInForm";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell active="signin">
      {clerkConfigured() ? (
        <SignInForm />
      ) : (
        <p style={{ color: "var(--bms-muted)" }}>
          Authentication is not yet configured in this environment (Clerk keys pending).
        </p>
      )}
    </AuthShell>
  );
}
