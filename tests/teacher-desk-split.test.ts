import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attendanceCounts, isAttendanceStatus } from "../shared/attendanceDesk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("teacher desk split", () => {
  it("keeps assignments and quizzes on different pages, with no practice shelf", () => {
    const page = read("client/src/pages/teacher-dashboard.tsx");
    assert.match(page, /tab === "quiz"/);
    assert.equal(page.includes("PracticeShelf"), false);
    assert.match(page, /card-home-goals/);
    assert.match(page, /card-reflect-goals/);
    assert.match(page, /goals.length > 0/);
    assert.match(page, /card-feedback/);
    assert.match(page, /button-send-feedback/);
    assert.equal(page.includes('tab === "home" || tab === "work"'), false);
  });
});

describe("admin attendance list", () => {
  it("counts teachers and trainers separately", () => {
    const counts = attendanceCounts([
      { id: "t", name: "Amina", role: "teacher", status: "present" },
      { id: "r", name: "Neema", role: "trainer", status: "late" },
      { id: "x", name: "Idle", role: "teacher", status: null },
    ]);
    assert.equal(counts.teachers, 2);
    assert.equal(counts.trainers, 1);
    assert.equal(counts.present, 2);
    assert.equal(isAttendanceStatus("excused"), true);
    assert.equal(isAttendanceStatus("holiday"), false);
    const route = read("server/routes.ts");
    assert.match(route, /\/api\/admin\/attendance/);
    assert.match(route, /trainer_attendance/);
    const nav = read("client/src/components/AdminNav.tsx");
    assert.match(nav, /Attendance/);
  });
});
