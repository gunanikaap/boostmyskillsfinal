import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { getPool } from "@/lib/db/pool";
import { promoteToAdmin } from "@/lib/auth/appUser";
import { resetDb, teardown } from "@/tests/helpers/db";
import { POST } from "@/app/api/webhooks/clerk/route";

// A throwaway signing secret used ONLY to sign fixtures; matches what the route
// verifies against via CLERK_WEBHOOK_SIGNING_SECRET. Never a real Clerk secret.
const SECRET = "whsec_" + randomBytes(24).toString("base64");
const wh = new Webhook(SECRET);

const prevSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
beforeEach(async () => {
  await resetDb();
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
});
afterEach(() => {
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = prevSecret;
});
afterAll(teardown);

function signedRequest(payload: object, { tamper = false } = {}): Request {
  const body = JSON.stringify(payload);
  const id = "msg_" + randomBytes(6).toString("hex");
  const timestamp = new Date(); // standardwebhooks accepts a Date
  const signature = wh.sign(id, timestamp, body);
  const sig = tamper ? signature + "x" : signature;
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": sig,
    },
    body,
  });
}

function userEvent(type: "user.created" | "user.updated", over: Record<string, unknown> = {}) {
  return {
    type,
    data: {
      id: "clerk_wh_1",
      username: "webhookuser",
      primary_email_address_id: "e1",
      email_addresses: [{ id: "e1", email_address: "  Hook@Example.COM " }],
      first_name: "Web",
      last_name: "Hook",
      ...over,
    },
  };
}

describe("Clerk webhook (signed fixtures)", () => {
  it("accepts a valid signed user.created and syncs a normalized user", async () => {
    const res = await POST(signedRequest(userEvent("user.created")) as never);
    expect(res.status).toBe(200);
    const row = await getPool().query(
      `SELECT email, username FROM app_users WHERE clerk_user_id='clerk_wh_1'`,
    );
    expect(row.rows[0]!.email).toBe("hook@example.com"); // normalized
    expect(row.rows[0]!.username).toBe("webhookuser");
  });

  it("is idempotent on duplicate signed delivery (no second row)", async () => {
    await POST(signedRequest(userEvent("user.created")) as never);
    await POST(signedRequest(userEvent("user.created")) as never);
    const count = await getPool().query(
      `SELECT count(*)::int c FROM app_users WHERE clerk_user_id='clerk_wh_1'`,
    );
    expect(count.rows[0]!.c).toBe(1);
  });

  it("rejects an invalid signature (400)", async () => {
    const res = await POST(signedRequest(userEvent("user.created"), { tamper: true }) as never);
    expect(res.status).toBe(400);
    const count = await getPool().query(`SELECT count(*)::int c FROM app_users`);
    expect(count.rows[0]!.c).toBe(0);
  });

  it("rejects an unsigned request (400)", async () => {
    const body = JSON.stringify(userEvent("user.created"));
    const req = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 503 when the signing secret is not configured", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    const res = await POST(signedRequest(userEvent("user.created")) as never);
    expect(res.status).toBe(503);
  });

  it("preserves an existing Admin role on user.updated", async () => {
    await POST(signedRequest(userEvent("user.created")) as never);
    await promoteToAdmin("hook@example.com");
    const res = await POST(
      signedRequest(userEvent("user.updated", { first_name: "Renamed" })) as never,
    );
    expect(res.status).toBe(200);
    const row = await getPool().query(
      `SELECT role, first_name FROM app_users WHERE clerk_user_id='clerk_wh_1'`,
    );
    expect(row.rows[0]!.role).toBe("admin"); // not demoted
    expect(row.rows[0]!.first_name).toBe("Renamed");
  });
});
