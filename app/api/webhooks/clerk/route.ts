import { NextResponse, type NextRequest } from "next/server";
import { syncAppUser } from "@/lib/auth/appUser";
import { SyncError } from "@/lib/auth/normalize";

/**
 * Clerk webhook: keeps app_users in sync on user.created / user.updated.
 * The signature is verified with the Clerk-provided verifier (svix under the
 * hood) using CLERK_WEBHOOK_SIGNING_SECRET. Unsigned/invalid requests are
 * rejected. The raw body and full profile object are never logged.
 *
 * Role is intentionally NOT taken from the payload — syncAppUser preserves it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  let evt: { type: string; data: Record<string, unknown> };
  try {
    const { verifyWebhook } = await import("@clerk/nextjs/webhooks");
    evt = (await verifyWebhook(req)) as unknown as typeof evt;
  } catch {
    // Do not log the raw body or signature material.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const data = evt.data as {
      id: string;
      username?: string | null;
      email_addresses?: { id: string; email_address: string }[];
      primary_email_address_id?: string;
      first_name?: string | null;
      last_name?: string | null;
      unsafe_metadata?: { country?: unknown; gender?: unknown };
    };
    const primary =
      data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
      data.email_addresses?.[0];
    const meta = data.unsafe_metadata;
    try {
      await syncAppUser({
        clerkUserId: data.id,
        email: primary?.email_address ?? "",
        username: data.username ?? null,
        firstName: data.first_name ?? null,
        lastName: data.last_name ?? null,
        country: typeof meta?.country === "string" ? meta.country : null,
        gender: typeof meta?.gender === "string" ? meta.gender : null,
      });
    } catch (err) {
      if (err instanceof SyncError) {
        // Typed, safe failure (missing email / email or username collision).
        // Return 422 so Clerk records a non-2xx without us writing a bad row.
        return NextResponse.json({ error: err.code }, { status: 422 });
      }
      throw err;
    }
  }
  return NextResponse.json({ ok: true });
}
