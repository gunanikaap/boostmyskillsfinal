import SiteHeader from "@/components/SiteHeader";
import { verifyCertificate } from "@/lib/certificates/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const v = await verifyCertificate(code);
  return { title: v ? "Certificate verification" : "Certificate not found" };
}

/**
 * Public certificate verification. Exposes ONLY approved fields — no email,
 * Clerk id, storage paths, attempt answers, grading details or internal metadata.
 * Remains verifiable even when the related credential is hidden.
 */
export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const v = await verifyCertificate(code);
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 680 }}>
        <h1>Certificate verification</h1>
        {!v ? (
          <div className="card">
            <p>No certificate matches this verification code.</p>
          </div>
        ) : (
          <div className="card" style={{ borderColor: v.revoked ? "#a15" : "var(--bms-green)" }}>
            <p style={{ fontWeight: 700, color: v.revoked ? "#a15" : "var(--bms-green)" }}>
              {v.revoked ? "REVOKED" : "VALID — issued certificate"}
            </p>
            <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6 }}>
              <dt style={{ color: "var(--bms-muted)" }}>Learner</dt>
              <dd style={{ margin: 0 }}>{v.learnerName}</dd>
              <dt style={{ color: "var(--bms-muted)" }}>Credential</dt>
              <dd style={{ margin: 0 }}>
                {v.credentialCode} — {v.credentialTitle}
              </dd>
              <dt style={{ color: "var(--bms-muted)" }}>Organisation</dt>
              <dd style={{ margin: 0 }}>{v.organisationName}</dd>
              <dt style={{ color: "var(--bms-muted)" }}>Issued by</dt>
              <dd style={{ margin: 0 }}>{v.issuerName}</dd>
              <dt style={{ color: "var(--bms-muted)" }}>Issue date</dt>
              <dd style={{ margin: 0 }}>{v.issueDate.slice(0, 10)}</dd>
              <dt style={{ color: "var(--bms-muted)" }}>Verification code</dt>
              <dd style={{ margin: 0 }}>{v.verificationCode}</dd>
            </dl>
          </div>
        )}
      </main>
    </>
  );
}
