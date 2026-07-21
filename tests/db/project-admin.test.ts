import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createProject, getProject, updateProject, ServiceError } from "@/lib/credentials/service";
import { resetDb, teardown } from "@/tests/helpers/db";

beforeEach(resetDb);
afterAll(teardown);

describe("project create / get / update", () => {
  it("creates, reads, and updates name / organisation / certificate template", async () => {
    const id = await createProject({
      name: "UAT Vertical Project",
      slug: `uat-proj-${Math.round(Math.random() * 1e9)}`,
      organisationName: "BoostMySkills UAT Organisation",
      certificateTemplate: { issuerName: "RES4CITY" },
    });
    const created = await getProject(id);
    expect(created?.name).toBe("UAT Vertical Project");
    expect((created?.certificateTemplate as { issuerName: string }).issuerName).toBe("RES4CITY");

    await updateProject(id, {
      name: "UAT Vertical Project (edited)",
      organisationName: "BoostMySkills UAT Org 2",
      certificateTemplate: {
        issuerName: "RES4CITY",
        signatoryName: "Programme Director",
        signatoryRole: "Director",
      },
    });
    const updated = await getProject(id);
    expect(updated?.name).toBe("UAT Vertical Project (edited)");
    expect(updated?.organisationName).toBe("BoostMySkills UAT Org 2");
    const tpl = updated?.certificateTemplate as { signatoryName: string; signatoryRole: string };
    expect(tpl.signatoryName).toBe("Programme Director");
    expect(tpl.signatoryRole).toBe("Director");
  });

  it("rejects updating a non-existent project", async () => {
    await expect(
      updateProject("00000000-0000-0000-0000-000000000000", {
        name: "x",
        organisationName: "y",
        certificateTemplate: { issuerName: "z" },
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects an invalid certificate template on update", async () => {
    const id = await createProject({
      name: "P",
      slug: `p-${Math.round(Math.random() * 1e9)}`,
      organisationName: "Org",
      certificateTemplate: { issuerName: "Issuer" },
    });
    await expect(
      // missing required issuerName -> zod parse throws
      updateProject(id, { name: "P", organisationName: "Org", certificateTemplate: {} }),
    ).rejects.toThrow();
  });
});
