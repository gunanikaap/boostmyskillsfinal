import { NextResponse, type NextRequest } from "next/server";
import { syncAppUser } from "@/lib/auth/appUser";

/**
 * Clerk webhook: keeps app_users in sync on user.created / user.updated.
 * The signature is verified with the Clerk-provided verifier (svix under the
 * hood) using CLERK_WEBHOOK_SIGNING_SECRET. Unverified requests are rejected.
 *
 * NOTE: real delivery requires a configured Clerk instance + webhook secret,
 * which is an external blocker (no UAT keys yet). The handler is implemented and
 * type-checked; end-to-end delivery is unverified until keys exist.
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
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const data = evt.data as {
      id: string;
      email_addresses?: { id: string; email_address: string }[];
      primary_email_address_id?: string;
      first_name?: string | null;
      last_name?: string | null;
    };
    const primary =
      data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
      data.email_addresses?.[0];
    await syncAppUser({
      clerkUserId: data.id,
      email: primary?.email_address ?? "",
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
    });
  }
  return NextResponse.json({ ok: true });
}
