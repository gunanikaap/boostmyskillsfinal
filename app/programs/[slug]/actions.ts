"use server";

import { requireAuthenticatedUser, requireProgrammeAccess } from "@/lib/access/guards";
import { registerForProgramme } from "@/lib/enrolments/service";
import { AccessError } from "@/lib/access/errors";

export interface RegisterResult {
  ok: boolean;
  message: string;
}

export async function registerForProgrammeAction(programmeId: string): Promise<RegisterResult> {
  try {
    await requireProgrammeAccess(programmeId);
    const user = await requireAuthenticatedUser();
    await registerForProgramme(user.id, programmeId);
    return { ok: true, message: "Registered for the programme." };
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.kind === "unauthenticated")
        return { ok: false, message: "Please sign in to register." };
      return { ok: false, message: "This programme is not available." };
    }
    return { ok: false, message: "Registration failed. Please try again." };
  }
}
