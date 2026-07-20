import { z } from "zod";
import redirectData from "@/data/redirects.json";

const redirectEntry = z.object({
  from: z.string().startsWith("/"),
  to: z.string().startsWith("/"),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
});

export const redirectFileSchema = z.object({
  schemaVersion: z.literal(1),
  description: z.string().optional(),
  authRedirects: z.array(redirectEntry),
  legacyRedirects: z.array(redirectEntry),
});

export type RedirectEntry = z.infer<typeof redirectEntry>;

/** Validate and load the redirect map (throws on a malformed file). */
export function loadRedirects(): {
  authRedirects: RedirectEntry[];
  legacyRedirects: RedirectEntry[];
} {
  const parsed = redirectFileSchema.parse(redirectData);
  return { authRedirects: parsed.authRedirects, legacyRedirects: parsed.legacyRedirects };
}

/** Resolve a path to its redirect target, or null if none applies. */
export function resolveRedirect(path: string): RedirectEntry | null {
  const { authRedirects, legacyRedirects } = loadRedirects();
  const all = [...authRedirects, ...legacyRedirects];
  const normalised = path.replace(/\/+$/, "") || "/";
  return all.find((r) => r.from.replace(/\/+$/, "") === normalised) ?? null;
}

/**
 * Validate a `next`/`return` URL parameter to prevent open-redirects. Only
 * same-origin, absolute in-app paths are allowed; anything with a scheme, host,
 * backslash, protocol-relative prefix, or an encoded dot-segment is rejected.
 */
export function safeReturnPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  let value = raw.trim();
  // Bounded decode to catch encoded traversal (e.g. %2e%2e, %2f).
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!value.startsWith("/")) return fallback; // must be an in-app absolute path
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback; // protocol-relative
  if (/[\\]/.test(value)) return fallback; // no backslashes
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return fallback; // no embedded scheme
  const segments = value.split("/");
  if (segments.some((s) => s === "." || s === "..")) return fallback; // no dot-segments
  return value;
}
