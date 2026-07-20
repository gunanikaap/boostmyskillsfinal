import { SignIn } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!clerkConfigured()) {
    return (
      <main className="container" style={{ paddingTop: 48 }}>
        <div className="card">
          <h1>Sign in</h1>
          <p>Authentication is not yet configured in this environment (Clerk keys pending).</p>
        </div>
      </main>
    );
  }
  return (
    <main
      className="container"
      style={{ paddingTop: 48, display: "flex", justifyContent: "center" }}
    >
      <SignIn />
    </main>
  );
}
