/**
 * Private asset keys referenced by a content document.
 *
 * Only the allowlisted private-asset fields count (a unit's PDF `objectKey` and
 * `mediaObjectKey`). Used to authorise the /content-asset route by proving that
 * the exact requested storage key is referenced by a specific credential
 * revision — never by an arbitrary prefix or by mere credential ownership.
 * Walks defensively so it also works on a partially-formed draft document.
 */
const ASSET_FIELDS = ["objectKey", "mediaObjectKey"] as const;

export function contentAssetKeys(content: unknown): Set<string> {
  const keys = new Set<string>();
  const doc = content as { sections?: unknown } | null | undefined;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.sections)) return keys;
  for (const section of doc.sections) {
    const subs = (section as { subsections?: unknown })?.subsections;
    if (!Array.isArray(subs)) continue;
    for (const sub of subs) {
      const units = (sub as { units?: unknown })?.units;
      if (!Array.isArray(units)) continue;
      for (const unit of units) {
        const data = (unit as { data?: Record<string, unknown> })?.data;
        if (!data || typeof data !== "object") continue;
        for (const field of ASSET_FIELDS) {
          const v = data[field];
          if (typeof v === "string" && v.length > 0) keys.add(v);
        }
      }
    }
  }
  return keys;
}

/** True only when `key` is referenced by an allowlisted asset field of `content`. */
export function contentReferencesAssetKey(content: unknown, key: string): boolean {
  return contentAssetKeys(content).has(key);
}
