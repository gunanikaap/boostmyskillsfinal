"use server";

import { requireAuthenticatedUser } from "@/lib/access/guards";
import { requirePublishedCredentialAccess } from "@/lib/access/guards";
import { enrolInCredential } from "@/lib/enrolments/service";
import { AccessError } from "@/lib/access/errors";

export interface EnrolResult {
  ok: boolean;
  message: string;
}

export async function enrolInCredentialAction(credentialId: string): Promise<EnrolResult> {
  try {
    // Must be published/visible to enrol, and the caller must be authenticated.
    await requirePublishedCredentialAccess(credentialId);
    const user = await requireAuthenticatedUser();
    const { reused } = await enrolInCredential(user.id, credentialId);
    return { ok: true, message: reused ? "You are already enrolled." : "Enrolled successfully." };
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.kind === "unauthenticated") return { ok: false, message: "Please sign in to enrol." };
      if (err.kind === "hidden" || err.kind === "not_found")
        return { ok: false, message: "This credential is not available." };
      return { ok: false, message: "You cannot enrol in this credential." };
    }
    return { ok: false, message: "Enrolment failed. Please try again." };
  }
}
