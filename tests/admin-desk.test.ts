import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allApprovalHistorySelectSql,
  approvalHistoryPage,
  approvalHistoryToCsv,
  batchApprovalHistoryCountSql,
  batchApprovalHistorySelectSql,
} from "../server/approvalHistoryQuery.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("admin desk", () => {
  it("puts admin links in a side menu, joins trainers and teachers, and drops the handover card", () => {
    const nav = read("client/src/components/AdminNav.tsx");
    const home = read("client/src/pages/admin-home.tsx");
    for (const label of ["Approvals", "People", "Cohorts", "Attendance", "Analytics", "Certificates"]) {
      assert.match(nav, new RegExp(label));
    }
    assert.equal(nav.includes('href: "/courses"'), false);
    assert.equal(nav.includes('label: "Trainers"'), false);
    assert.equal(nav.includes('label: "Teachers"'), false);
    assert.match(nav, /lg:fixed/);
    assert.equal(nav.toLowerCase().includes("handover"), false);
    assert.equal(nav.includes("rounded-full"), false);
    assert.equal(home.includes("/admin/handover"), false);
    assert.equal(home.includes("showAdminNav"), true);
    // The redesigned Home (design/board/AdminHome.dc.html) has no picture tiles: the menu opens each part.
    assert.equal(home.includes("PlaceArt"), false);
    assert.match(home, /Needs attention/);
    assert.match(home, /The academy at a glance/);
    assert.match(home, /Clear previous activity…/);
    const auth = read("client/src/pages/unified-auth.tsx");
    assert.match(auth, /\/bg-library.jpg/);
    assert.match(auth, /PLACES\[place\]/);
    assert.match(auth, /sl-sign-role/);
    assert.equal(auth.toLowerCase().includes("adult teacher"), false);
    assert.equal(home.includes("LearningPath"), false);
    assert.equal(home.includes("Total Trainers"), false);
    assert.equal(home.includes('href: "/courses"'), false);
    const batches = read("client/src/pages/admin-batches.tsx");
    const app = read("client/src/App.tsx");
    assert.match(batches, /data-testid="button-add-course"/);
    assert.match(batches, /button-open-course-\$\{course\.id\}/);
    assert.match(app, /CoursesCatalogRedirect/);
    assert.equal(app.includes("CoursesList"), false);
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
    assert.match(approvals, /button-export-approvals/);
    assert.match(approvals, /\/api\/admin\/approval-history\?format=csv/);
    const allSql = allApprovalHistorySelectSql(false);
    assert.match(allSql, /FROM approval_history/);
    assert.equal(allSql.includes("batch_teachers"), false);
    assert.match(allApprovalHistorySelectSql(true), /LIMIT \$1 OFFSET \$2/);
  });
});
