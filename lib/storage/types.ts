/** Provider-neutral object storage abstraction. Business code depends on this,
 * never on a concrete filesystem/S3 implementation. Only logical, provider-neutral
 * object keys are ever persisted in the database or JSON records. */

export type StorageErrorCode =
  | "invalid_key"
  | "traversal"
  | "absolute_path"
  | "windows_drive_path"
  | "null_byte"
  | "symlink_escape"
  | "not_found"
  | "too_large"
  | "unsupported_type"
  | "invalid_image"
  | "not_configured";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StorageError";
    this.code = code;
  }
}

export interface PutOptions {
  contentType: string;
  /** Hard byte ceiling for this write (defence in depth). */
  maxBytes?: number;
}

export interface StorageProvider {
  /** Kind of backend ("local" | "b2"). */
  readonly driver: string;
  putObject(key: string, data: Buffer, opts: PutOptions): Promise<void>;
  /** Read the full object (authorized callers only — routes enforce access). */
  getObject(key: string): Promise<Buffer>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  /**
   * A path/URL for PUBLIC objects, served through a controlled application route
   * (never a raw filesystem path or a permanent signed URL). Access policy is
   * enforced by the route, not by this value.
   */
  publicPath(key: string): string;
}
