"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/access/guards";
import { AccessError } from "@/lib/access/errors";
import { updateAccountProfile, AccountError } from "@/lib/account/profile";
import type { AccountPatch } from "@/lib/account/types";
import {
  requestAccountDeletion,
  cancelMyDeletionRequest,
  DeletionError,
} from "@/lib/account/deletion";

export interface AccountActionResult {
  ok: boolean;
  message: string;
}

/** Save a partial account update (one field or a small group at a time). */
export async function saveAccountAction(patch: AccountPatch): Promise<AccountActionResult> {
  try {
    const user = await requireAuthenticatedUser();
    await updateAccountProfile(user.id, user.clerkUserId, patch);
    revalidatePath("/account");
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, message: err.message };
    if (err instanceof AccessError) return { ok: false, message: "Please sign in again." };
    return { ok: false, message: "Could not save your changes. Please try again." };
  }
}

/** Raise an admin-reviewed account deletion request. */
export async function requestDeletionAction(reason: string): Promise<AccountActionResult> {
  try {
    const user = await requireAuthenticatedUser();
    await requestAccountDeletion(user.id, reason);
    revalidatePath("/account");
    return {
      ok: true,
      message: "Your deletion request has been sent to an administrator for approval.",
    };
  } catch (err) {
    if (err instanceof DeletionError) return { ok: false, message: err.message };
    if (err instanceof AccessError) return { ok: false, message: "Please sign in again." };
    return { ok: false, message: "Could not submit your request. Please try again." };
  }
}

/** Withdraw the current user's own pending deletion request. */
export async function cancelDeletionAction(): Promise<AccountActionResult> {
  try {
    const user = await requireAuthenticatedUser();
    await cancelMyDeletionRequest(user.id);
    revalidatePath("/account");
    return { ok: true, message: "Your deletion request has been withdrawn." };
  } catch (err) {
    if (err instanceof AccessError) return { ok: false, message: "Please sign in again." };
    return { ok: false, message: "Could not withdraw your request. Please try again." };
  }
}
