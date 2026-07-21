import { notFound } from "next/navigation";
import { adminGetCredential } from "@/lib/admin/queries";
import { CredentialActions } from "./CredentialActions";
import { BannerUpload } from "./BannerUpload";
import { ContentBuilder } from "./ContentBuilder";
import { toBuilderState, emptyBuilderState } from "@/lib/admin/builder/model";
import {
  contentDocumentSchema,
  gradingDocumentSchema,
  certificationRuleSchema,
} from "@/lib/content/schema";

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

  // Build the visual-builder initial state from the draft (safe-parse; empty on first draft).
  let builderState = emptyBuilderState();
  if (draft) {
    const content = contentDocumentSchema.safeParse(draft.content_document);
    const grading = gradingDocumentSchema.safeParse(draft.grading_document);
    const rule = certificationRuleSchema.safeParse(draft.certification_rule);
    if (content.success && grading.success && rule.success) {
      builderState = toBuilderState(content.data, grading.data, rule.data);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <p style={{ color: "var(--bms-muted)", margin: 0 }}>{cred.project_name}</p>
        <h1 style={{ margin: "4px 0" }}>{cred.code}</h1>
        <p>
          Status: <StatusBadge status={cred.status} /> · Draft: {draft ? "yes" : "no"} · Published:{" "}
          {published ? "yes" : "no"}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href={`/admin/credentials/${id}/export`}>
            Export OLX (.tar.gz)
          </a>
          <a className="btn" href={`/admin/credentials/${id}/olx-archive`}>
            Download source archive
          </a>
        </div>
      </div>

      <BannerUpload credentialId={id} />

      <ContentBuilder credentialId={id} editable={Boolean(draft)} initial={builderState} />

      <CredentialActions
        credentialId={id}
        status={cred.status}
        hasDraft={Boolean(draft)}
        hasPublished={Boolean(published)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "published" ? "#1f7a53" : status === "hidden" ? "#a15" : "#777";
  const label = status === "hidden" ? "Hidden" : status === "published" ? "Published" : "Draft";
  return (
    <span
      style={{
        color,
        fontWeight: 700,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "1px 10px",
        fontSize: 13,
      }}
    >
      {label}
    </span>
  );
}
