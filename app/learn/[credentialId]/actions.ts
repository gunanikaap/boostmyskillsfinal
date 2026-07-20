"use server";

import { requireAuthenticatedUser } from "@/lib/access/guards";
import { submitMcqAttempt, recordUnitProgress } from "@/lib/player/service";
import { AccessError } from "@/lib/access/errors";
import { revalidatePath } from "next/cache";

export interface McqActionResult {
  ok: boolean;
  message: string;
  percentage?: number;
  passed?: boolean;
}

export async function submitMcqAction(
  credentialId: string,
  unitId: string,
  answers: Record<string, string[]>,
): Promise<McqActionResult> {
  try {
    const user = await requireAuthenticatedUser();
    const outcome = await submitMcqAttempt({ userId: user.id, credentialId, unitId, answers });
    revalidatePath(`/learn/${credentialId}`);
    return {
      ok: true,
      message: outcome.result.passed ? "Passed!" : "Submitted.",
      percentage: outcome.result.percentage,
      passed: outcome.result.passed,
    };
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.kind === "unauthenticated") return { ok: false, message: "Please sign in." };
      if (err.kind === "hidden" || err.kind === "not_found")
        return { ok: false, message: "This content is not available." };
      if (err.kind === "forbidden") return { ok: false, message: "No attempts remaining." };
    }
    return { ok: false, message: "Submission failed." };
  }
}

export async function markUnitCompleteAction(
  credentialId: string,
  unitId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireAuthenticatedUser();
    await recordUnitProgress({
      userId: user.id,
      credentialId,
      unitId,
      status: "completed",
      progressPercent: 100,
    });
    revalidatePath(`/learn/${credentialId}`);
    return { ok: true, message: "Marked complete." };
  } catch (err) {
    if (err instanceof AccessError && err.kind === "hidden")
      return { ok: false, message: "This content is not available." };
    return { ok: false, message: "Could not update progress." };
  }
}
