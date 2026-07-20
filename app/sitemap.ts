import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { listPublishedCredentials, listPublishedProgrammes } from "@/lib/catalogue/queries";

export const dynamic = "force-dynamic";

/**
 * sitemap.xml — public, real routes ONLY. Draft and hidden catalogue entries are
 * never included (the catalogue queries return published+visible only).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticRoutes = [
    "",
    "/about",
    "/contact",
    "/courses",
    "/programs",
    "/privacy",
    "/cookie_policy",
    "/tos",
  ];
  const entries: MetadataRoute.Sitemap = staticRoutes.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.6,
  }));

  try {
    const [credentials, programmes] = await Promise.all([
      listPublishedCredentials(),
      listPublishedProgrammes(),
    ]);
    for (const c of credentials) entries.push({ url: `${base}/courses/${c.slug}`, priority: 0.7 });
    for (const p of programmes) entries.push({ url: `${base}/programs/${p.slug}`, priority: 0.7 });
  } catch {
    // If the DB is unreachable at build/request time, still return static routes.
  }
  return entries;
}
