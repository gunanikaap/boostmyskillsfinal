"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { withTransaction } from "@/lib/db/tx";
import {
  createProject,
  createCredentialWithDraft,
  saveDraft,
  publishCredential,
  createDraftFromPublished,
  hideCredential,
  unhideCredential,
  ServiceError,
} from "@/lib/credentials/service";
import {
  createProgramme,
  setProgrammeCredentials,
  publishProgramme,
  hideProgramme,
  unhideProgramme,
} from "@/lib/programmes/service";
import { setMaintenance } from "@/lib/settings/maintenance";
import { ContentValidationError } from "@/lib/content/validate";

export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

function fail(err: unknown): ActionResult {
  if (err instanceof AccessError) return { ok: false, message: "Not authorised." };
  if (err instanceof ContentValidationError) return { ok: false, message: err.message };
  if (err instanceof ServiceError) return { ok: false, message: err.message };
  if (err instanceof Error) return { ok: false, message: err.message };
  return { ok: false, message: "Operation failed." };
}

export async function createProjectAction(form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = await createProject({
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      organisationName: String(form.get("organisationName") ?? ""),
      certificateTemplate: {
        issuerName: String(form.get("issuerName") ?? form.get("organisationName") ?? "Issuer"),
      },
    });
    revalidatePath("/admin/projects");
    return { ok: true, message: "Project created.", id };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Create a credential with its first draft. A Project can be created inline in
 * the same operation (§3.2) by supplying newProject* fields instead of projectId.
 */
export async function createCredentialAction(form: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    return await withTransaction(async (tx) => {
      let projectId = String(form.get("projectId") ?? "");
      if (!projectId) {
        projectId = await createProject(
          {
            name: String(form.get("newProjectName") ?? ""),
            slug: String(form.get("newProjectSlug") ?? ""),
            organisationName: String(form.get("newProjectOrg") ?? ""),
            certificateTemplate: {
              issuerName: String(form.get("newProjectOrg") ?? "Issuer"),
            },
          },
          tx,
        );
      }
      const { credentialId } = await createCredentialWithDraft(
        {
          projectId,
          code: String(form.get("code") ?? ""),
          slug: String(form.get("slug") ?? ""),
          title: String(form.get("title") ?? ""),
          authorName: String(form.get("authorName") ?? ""),
          shortDescription: String(form.get("shortDescription") ?? "") || undefined,
          aboutHtml: String(form.get("aboutHtml") ?? "") || undefined,
          createdBy: admin.id,
        },
        tx,
      );
      revalidatePath("/admin/credentials");
      return { ok: true, message: "Credential draft created.", id: credentialId };
    });
  } catch (err) {
    return fail(err);
  }
}

/** Save the draft content/grading/rule from JSON authoring input. */
export async function saveDraftContentAction(
  credentialId: string,
  payload: { content?: unknown; grading?: unknown; certificationRule?: unknown; title?: string },
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await saveDraft({ credentialId, ...payload });
    revalidatePath(`/admin/credentials/${credentialId}`);
    return { ok: true, message: "Draft saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function publishCredentialAction(credentialId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await publishCredential(credentialId);
    revalidatePath(`/admin/credentials/${credentialId}`);
    revalidatePath("/courses");
    return { ok: true, message: "Published." };
  } catch (err) {
    return fail(err);
  }
}

export async function createDraftChangesAction(credentialId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await createDraftFromPublished(credentialId, admin.id);
    revalidatePath(`/admin/credentials/${credentialId}`);
    return { ok: true, message: "Draft changes created from published content." };
  } catch (err) {
    return fail(err);
  }
}

export async function hideCredentialAction(credentialId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await hideCredential(credentialId, admin.id);
    revalidatePath(`/admin/credentials/${credentialId}`);
    revalidatePath("/courses");
    return { ok: true, message: "Hidden." };
  } catch (err) {
    return fail(err);
  }
}

export async function unhideCredentialAction(credentialId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await unhideCredential(credentialId);
    revalidatePath(`/admin/credentials/${credentialId}`);
    revalidatePath("/courses");
    return { ok: true, message: "Unhidden." };
  } catch (err) {
    return fail(err);
  }
}

export async function createProgrammeAction(form: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const id = await createProgramme({
      projectId: String(form.get("projectId") ?? ""),
      slug: String(form.get("slug") ?? ""),
      title: String(form.get("title") ?? ""),
      shortDescription: String(form.get("shortDescription") ?? "") || undefined,
      aboutHtml: String(form.get("aboutHtml") ?? "") || undefined,
      createdBy: admin.id,
    });
    revalidatePath("/admin/programmes");
    return { ok: true, message: "Programme created.", id };
  } catch (err) {
    return fail(err);
  }
}

export async function setProgrammeCredentialsAction(
  programmeId: string,
  items: { credentialId: string; position: number; isRequired?: boolean }[],
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await setProgrammeCredentials(programmeId, items);
    revalidatePath(`/admin/programmes/${programmeId}`);
    return { ok: true, message: "Membership updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function publishProgrammeAction(programmeId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await publishProgramme(programmeId);
    revalidatePath("/programs");
    return { ok: true, message: "Programme published." };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleProgrammeHiddenAction(
  programmeId: string,
  hide: boolean,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (hide) await hideProgramme(programmeId);
    else await unhideProgramme(programmeId);
    revalidatePath("/programs");
    return { ok: true, message: hide ? "Programme hidden." : "Programme unhidden." };
  } catch (err) {
    return fail(err);
  }
}

export async function setMaintenanceAction(
  enabled: boolean,
  message?: string,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await setMaintenance({ enabled, message, adminUserId: admin.id });
    revalidatePath("/admin/maintenance");
    return { ok: true, message: enabled ? "Maintenance enabled." : "Maintenance disabled." };
  } catch (err) {
    return fail(err);
  }
}
