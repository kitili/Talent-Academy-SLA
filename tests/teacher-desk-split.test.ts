import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRACTICE_LESSONS } from "../shared/practiceLessons.ts";
import { attendanceCounts, isAttendanceStatus } from "../shared/attendanceDesk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("teacher desk split", () => {
  it("keeps materials, assignments, and quizzes on different pages", () => {
    const page = read("client/src/pages/teacher-dashboard.tsx");
    assert.match(page, /tab === "quiz"/);
    assert.match(page, /PracticeShelf/);
    assert.match(page, /card-home-goals/);
    assert.match(page, /card-feedback/);
    assert.match(page, /button-send-feedback/);
    assert.equal(page.includes('tab === "home" || tab === "work"'), false);
  });

  it("offers practice lessons a teacher can read", () => {
    assert.equal(PRACTICE_LESSONS.length >= 3, true);
    assert.equal(new Set(PRACTICE_LESSONS.map((lesson) => lesson.id)).size, PRACTICE_LESSONS.length);
    assert.match(PRACTICE_LESSONS[0].body, /not an assignment/i);
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
