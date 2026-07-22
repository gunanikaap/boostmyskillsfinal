import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { adminEnrolmentAnalytics, analyticsToCsv } from "@/lib/admin/analytics";
import { createCredentialWithDraft, saveDraft, publishCredential } from "@/lib/credentials/service";
import { enrolInCredential } from "@/lib/enrolments/service";
import { submitMcqAttempt } from "@/lib/player/service";
import { resetDb, teardown } from "@/tests/helpers/db";
import { makeUser, makeProject, sampleContent } from "@/tests/helpers/factories";

beforeEach(resetDb);
afterAll(teardown);

const UNIT = "u-mcq-1";

describe("enrolment analytics + CSV", () => {
  it("reports learner progress/results and produces safe CSV", async () => {
    const admin = await makeUser("admin");
    const project = await makeProject();
    const { credentialId } = await createCredentialWithDraft({
      projectId: project,
      code: "MC-A1",
      slug: `mc-a1-${Math.round(Math.random() * 1e9)}`,
      title: "Analytics, Inc.", // comma forces CSV quoting
      authorName: "A",
      createdBy: admin,
    });
    const s = sampleContent(UNIT, "q1", "oa", "ob");
    await saveDraft({
      credentialId,
      content: s.content,
      grading: s.grading,
      certificationRule: s.certificationRule,
    });
    await publishCredential(credentialId);

    const learner = await makeUser("learner");
    await getPool().query(
      `UPDATE app_users SET first_name='Grace', last_name='Hopper' WHERE id=$1`,
      [learner],
    );
    await enrolInCredential(learner, credentialId);
    await submitMcqAttempt({
      userId: learner,
      credentialId,
      unitId: UNIT,
      answers: { q1: ["oa"] },
    });

    const rows = await adminEnrolmentAnalytics({ credentialId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.learnerName).toBe("Grace Hopper");
    expect(rows[0]!.completed).toBe(true);
    expect(rows[0]!.passed).toBe(true);

    const csv = analyticsToCsv(rows);
    expect(csv.split("\r\n")[0]).toContain("learner_name");
    expect(csv).toContain('"Analytics, Inc."'); // comma value quoted
    expect(csv).toContain("Grace Hopper");
    expect(csv).not.toContain("@example.com"); // no email leak in CSV
  });

  it("neutralises spreadsheet formula injection in CSV cells", () => {
    const csv = analyticsToCsv([
      {
        learnerName: '=HYPERLINK("http://evil","click")',
        organisationName: "+1-800-EVIL",
        projectName: "@SUM(A1:A9)",
        credentialCode: "-2+3",
        credentialTitle: "Safe Title",
        progressPercent: 100,
        completed: true,
        lastAccess: null,
        finalPercentage: 50,
        passed: true,
        enrolledAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    // Each dangerous leading char is prefixed with a single quote so the cell is
    // literal text, and comma-bearing quoted values keep the leading quote inside.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(csv).toContain("'+1-800-EVIL");
    expect(csv).toContain("'@SUM(A1:A9)");
    expect(csv).toContain("'-2+3");
    // A benign value is untouched.
    expect(csv).toContain("Safe Title");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  });
});
