import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { saveSubmission } from "@/lib/contact/store";

// Public endpoint — no auth. Kept strict + length-capped to limit abuse.
const contactSchema = z
  .object({
    firstName: z.string().trim().min(1, "Please enter your name.").max(120),
    lastName: z.string().trim().max(120).optional().default(""),
    email: z.string().trim().email("Please enter a valid email address.").max(254),
    message: z.string().trim().min(1, "Please enter a message.").max(5000),
  })
  .strict();

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Please check the form and try again.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  try {
    await saveSubmission(parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "We couldn't send your message right now. Please try again later." },
      { status: 500 },
    );
  }
}
