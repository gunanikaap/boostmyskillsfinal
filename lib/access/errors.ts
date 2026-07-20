export type AccessErrorKind =
  "unauthenticated" | "forbidden" | "not_found" | "maintenance" | "hidden";

/**
 * A typed access-control failure. Route handlers / server actions map these to
 * HTTP responses (401/403/404/503) or redirects. Never leak internal details.
 */
export class AccessError extends Error {
  readonly kind: AccessErrorKind;
  constructor(kind: AccessErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "AccessError";
    this.kind = kind;
  }
}

export const httpStatusForAccessError: Record<AccessErrorKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  maintenance: 503,
  hidden: 404, // hidden content must be indistinguishable from not-found publicly
};
