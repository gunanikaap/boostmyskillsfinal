import { getPool } from "@/lib/db/pool";
import { setTestActor, type ExternalIdentity } from "@/lib/auth/identity";

let n = 0;

/**
 * Create an app_user with a known clerk id, optionally as admin, and make it the
 * current test actor. Returns the app_user id and the identity.
 */
export async function actAs(
  role: "learner" | "admin" = "learner",
): Promise<{ userId: string; identity: ExternalIdentity }> {
  const suffix = `${Date.now().toString(36)}-${n++}`;
  const identity: ExternalIdentity = {
    clerkUserId: `clerk_actor_${suffix}`,
    email: `actor_${suffix}@example.com`,
    firstName: "Test",
    lastName: "Actor",
  };
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO app_users (clerk_user_id, email, first_name, last_name, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [identity.clerkUserId, identity.email, identity.firstName, identity.lastName, role],
  );
  setTestActor(identity);
  return { userId: rows[0]!.id, identity };
}

export function actAsAnonymous(): void {
  setTestActor(null);
}
