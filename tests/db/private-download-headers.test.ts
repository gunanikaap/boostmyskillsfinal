import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createCredentialWithDraft, saveDraft } from "@/lib/credentials/service";
import { GET as olxExport } from "@/app/admin/credentials/[id]/export/route";
import { GET as analyticsExport } from "@/app/admin/analytics/export/route";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject } from "@/tests/helpers/factories";
import { actAs, actAsAnonymous } from "@/tests/helpers/auth";

/**
 * Private downloads (P3 caching hardening): admin/owner-only file responses must
 * carry `Cache-Control: private, no-store` so shared/proxy caches never retain
 * grading answer keys (OLX archive) or learner PII (analytics CSV). The
 * revision-bound content-asset route is covered in content-asset.test.ts.
 */
beforeEach(async () => {
  await resetDb();
  actAsAnonymous();
});
afterAll(teardown);

async function makeCredential() {
  const admin = await makeUser("admin");
  const project = await makeProject();
  const u = randomUUID().slice(0, 8);
  const { credentialId } = await createCredentialWithDraft({
    projectId: project,
    code: `MC-${u}`,
    slug: `mc-${u}`,
    title: "T",
    authorName: "A",
    createdBy: admin,
  });
  await saveDraft({
    credentialId,
    content: {
      schemaVersion: 1,
      sections: [
        {
          id: "s1",
          sourceKey: null,
          title: "S",
          subsections: [
            {
              id: "sub1",
              sourceKey: null,
              title: "Sub",
              units: [
                {
                  id: "r1",
                  sourceKey: null,
                  type: "reading",
                  title: "R",
                  required: true,
                  data: { html: "<p>ok</p>" },
                },
              ],
            },
          ],
        },
      ],
    },
    grading: { schemaVersion: 1, units: [] },
    certificationRule: { thresholdPercent: 50, requiredUnitIds: [] },
  });
  return { credentialId };
}

describe("private download routes set no-store cache headers", () => {
  it("OLX export sets Cache-Control: private, no-store for an admin", async () => {
    const { credentialId } = await makeCredential();
    await actAs("admin");
    const res = await olxExport(new Request(`http://x/admin/credentials/${credentialId}/export`), {
      params: Promise.resolve({ id: credentialId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("OLX export denies a non-admin before serving any bytes", async () => {
    const { credentialId } = await makeCredential();
    await actAs("learner");
    const res = await olxExport(new Request(`http://x/x`), {
      params: Promise.resolve({ id: credentialId }),
    });
    expect(res.status).toBe(403);
  });

  it("analytics CSV export sets Cache-Control: private, no-store for an admin", async () => {
    await makeCredential();
    await actAs("admin");
    const res = await analyticsExport(new NextRequest("http://x/admin/analytics/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("analytics CSV export denies an anonymous caller (401)", async () => {
    actAsAnonymous();
    const res = await analyticsExport(new NextRequest("http://x/admin/analytics/export"));
    expect(res.status).toBe(401);
  });
});
