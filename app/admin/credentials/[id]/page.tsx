import { notFound } from "next/navigation";
import { adminGetCredential } from "@/lib/admin/queries";
import { CredentialActions } from "./CredentialActions";

export const dynamic = "force-dynamic";

export default async function AdminCredentialDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await adminGetCredential(id);
  if (!data) notFound();

  const cred = data.credential as { code: string; status: string; project_name: string };
  const draft = data.versions.find((v) => v.status === "draft");
  const published = data.versions.find((v) => v.status === "published");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <p style={{ color: "var(--bms-muted)", margin: 0 }}>{cred.project_name}</p>
        <h1 style={{ margin: "4px 0" }}>{cred.code}</h1>
        <p>
          Status: <strong>{cred.status}</strong> · Draft: {draft ? "yes" : "no"} · Published:{" "}
          {published ? "yes" : "no"}
        </p>
      </div>
      <CredentialActions
        credentialId={id}
        status={cred.status}
        hasDraft={Boolean(draft)}
        hasPublished={Boolean(published)}
        draftContent={JSON.stringify(
          draft?.content_document ?? { schemaVersion: 1, sections: [] },
          null,
          2,
        )}
        draftGrading={JSON.stringify(
          draft?.grading_document ?? { schemaVersion: 1, units: [] },
          null,
          2,
        )}
        draftRule={JSON.stringify(
          draft?.certification_rule ?? { thresholdPercent: 50, requiredUnitIds: [] },
          null,
          2,
        )}
      />
    </div>
  );
}
