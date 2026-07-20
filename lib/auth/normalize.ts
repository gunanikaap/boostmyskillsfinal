/** Identity normalization shared by lazy sync and the webhook. */

/** Trim + lowercase an email. Returns "" when the input is missing/blank. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Trim + lowercase a username. Returns null when missing/blank so we store NULL
 * (never an empty string) for a user without a username.
 */
export function normalizeUsername(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
}

export type SyncErrorCode = "missing_email" | "email_collision" | "username_collision";

/** A typed, safe synchronization failure (never writes an unusable row). */
export class SyncError extends Error {
  readonly code: SyncErrorCode;
  constructor(code: SyncErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SyncError";
    this.code = code;
  }
}
