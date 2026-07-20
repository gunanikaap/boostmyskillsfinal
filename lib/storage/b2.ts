import { StorageError, type StorageProvider } from "@/lib/storage/types";

/**
 * Inactive Backblaze B2 (S3-compatible) provider boundary. It defines the seam
 * where a real B2 client will live. It is NOT active in this release: every
 * operation fails clearly with `not_configured`. A real B2 connection is an
 * external blocker (UAT credentials + bucket) — see docs/uat/known-blockers.md.
 */
export class B2ObjectStorage implements StorageProvider {
  readonly driver = "b2";

  private unavailable(): never {
    throw new StorageError(
      "not_configured",
      "B2 storage is not active in this release (STORAGE_DRIVER=local). " +
        "A real B2 bucket + credentials are required to enable it.",
    );
  }

  // Implementations intentionally omit parameters (they always fail) — this still
  // satisfies the StorageProvider interface (fewer params is assignable).
  async putObject(): Promise<void> {
    this.unavailable();
  }
  async getObject(): Promise<Buffer> {
    this.unavailable();
  }
  async objectExists(): Promise<boolean> {
    this.unavailable();
  }
  async deleteObject(): Promise<void> {
    this.unavailable();
  }
  publicPath(): string {
    this.unavailable();
  }
}
