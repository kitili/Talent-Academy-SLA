import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalHistoryPage,
  approvalHistoryToCsv,
  batchApprovalHistoryCountSql,
  batchApprovalHistorySelectSql,
} from "../server/approvalHistoryQuery.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("admin desk", () => {
  it("puts admin links in a navbar and drops the handover card", () => {
    const nav = read("client/src/components/AdminNav.tsx");
    const home = read("client/src/pages/admin-home.tsx");
    for (const label of ["Approvals", "Trainers", "Teachers", "Cohorts", "Analytics", "Courses"]) {
      assert.match(nav, new RegExp(label));
    }
    assert.equal(nav.toLowerCase().includes("handover"), false);
    assert.equal(nav.includes("rounded-full"), false);
    assert.match(nav, /flex-wrap/);
    assert.match(nav, /gap-x-6/);
    assert.equal(home.includes("/admin/handover"), false);
    assert.equal(home.includes("showAdminNav"), true);
    assert.equal(home.includes("LearningPath"), false);
    assert.equal(home.includes("Total Trainers"), false);
  });

  it("asks for areas and people before clearing activity", () => {
    const home = read("client/src/pages/admin-home.tsx");
    assert.match(home, /teacherIds/);
    assert.match(home, /trainerIds/);
    assert.match(home, /check-area-\$\{id\}/);
    assert.match(home, /\["cohorts", "Cohorts"\]/);
    assert.match(home, /\["notices", "Notices"\]/);
    assert.equal(home.includes("clearSessionUser"), false);
  });
});

describe("batch approval history", () => {
  it("pages history that is already stored for one batch", () => {
    const page = approvalHistoryPage(2);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 8);
    assert.equal(page.offset, 8);
    assert.equal(approvalHistoryPage(0).page, 1);
    assert.equal(approvalHistoryPage("nope").offset, 0);
    assert.equal(approvalHistoryPage(1).pages(0), 1);
    assert.equal(approvalHistoryPage(1).pages(9), 2);
    const sql = batchApprovalHistorySelectSql(true);
    assert.match(sql, /FROM approval_history/);
    assert.match(sql, /batch_teachers/);
    assert.match(sql, /LIMIT \$2 OFFSET \$3/);
    assert.equal(sql.toLowerCase().includes("password"), false);
    assert.match(batchApprovalHistoryCountSql(), /COUNT\(\*\)::int AS total/);
    assert.match(batchApprovalHistorySelectSql(false), /LIMIT 5000/);
  });

  it("exports the saved rows", () => {
    const csv = approvalHistoryToCsv([
      {
        created_at: "2026-10-21T00:00:00.000Z",
        action: "approved",
        target_type: "teacher",
        target_name: 'Ada "Bee"',
        target_email: "ada@example.com",
        performed_by_name: "admin",
        performed_by_role: "admin",
      },
    ]);
    assert.match(csv, /^created_at,action,target_type/);
    assert.match(csv, /"Ada ""Bee"""/);
  });

  it("hides history until a batch dropdown is opened", () => {
    const approvals = read("client/src/pages/approvals.tsx");
    const batches = read("client/src/pages/admin-batches.tsx");
    const panel = read("client/src/components/BatchApprovalHistory.tsx");
    assert.equal(approvals.includes("Approval History"), false);
    assert.match(batches, /BatchApprovalHistory/);
    assert.match(panel, /select-approval-history/);
    assert.match(panel, /format=csv/);
    assert.match(panel, /choice === "history"/);
  });
});
