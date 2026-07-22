import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentAppUser } from "@/lib/auth/appUser";
import { listMyCertificates } from "@/lib/learner/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "My certificates" };

export default async function MyCertificatesPage() {
  const user = await getCurrentAppUser();
  // A deactivated account cannot view its private certificate listing.
  if (user?.deactivated) redirect("/account");
  if (!user) {
    return (
      <>
        <SiteHeader />
        <main className="container" style={{ paddingTop: 32 }}>
          <p>
            Please <Link href="/sign-in">sign in</Link> to view your certificates.
          </p>
        </main>
      </>
    );
  }
  const certs = await listMyCertificates(user.id);
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h1>My certificates</h1>
        {certs.length === 0 ? (
          <p style={{ color: "var(--bms-muted)" }}>You have no certificates yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {certs.map((c) => (
              <div
                key={c.verificationCode}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    {c.credentialCode} — {c.credentialTitle}
                  </h3>
                  <p style={{ color: "var(--bms-muted)", margin: "4px 0" }}>
                    Issued {c.issueDate.slice(0, 10)} · {c.status}
                  </p>
                  <Link href={`/certificates/${c.verificationCode}`}>Public verification</Link>
                </div>
                {c.status === "issued" && (
                  <a className="btn" href={`/account/certificates/${c.verificationCode}/download`}>
                    Download PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
