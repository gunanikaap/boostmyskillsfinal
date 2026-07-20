import { SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  if (!clerkConfigured()) {
    return (
      <main className="container" style={{ paddingTop: 48 }}>
        <div className="card">
          <h1>Create account</h1>
          <p>Registration is not yet configured in this environment (Clerk keys pending).</p>
        </div>
      </main>
    );
  }
  return (
    <main
      className="container"
      style={{ paddingTop: 48, display: "flex", justifyContent: "center" }}
    >
      <SignUp />
    </main>
  );
}
