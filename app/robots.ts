import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Never expose authoring, account, learner-player or API surfaces to crawlers.
      disallow: [
        "/admin",
        "/admin/",
        "/account",
        "/account/",
        "/learn",
        "/learn/",
        "/api/",
        "/dashboard",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
