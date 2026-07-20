import { LocalObjectStorage } from "@/lib/storage/local";
import { B2ObjectStorage } from "@/lib/storage/b2";
import { StorageError, type StorageProvider } from "@/lib/storage/types";

let cached: StorageProvider | undefined;

/**
 * Resolve the configured storage provider from STORAGE_DRIVER.
 *  - "local" (default): LocalObjectStorage rooted at LOCAL_STORAGE_ROOT.
 *  - "b2": inactive boundary (fails clearly until real B2 is provisioned).
 */
export function getStorage(): StorageProvider {
  if (cached) return cached;
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") {
    const root = process.env.LOCAL_STORAGE_ROOT ?? ".data/storage";
    cached = new LocalObjectStorage(root);
  } else if (driver === "b2") {
    cached = new B2ObjectStorage();
  } else {
    throw new StorageError("not_configured", `Unknown STORAGE_DRIVER: ${driver}`);
  }
  return cached;
}

/** Test/hot-reload helper: clear the cached provider. */
export function resetStorageForTests(): void {
  cached = undefined;
}
