import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isWritingExam,
  paperPreviewKind,
  quizVisibleToTeacher,
  summarizeTrainerDesk,
} from "../shared/trainerDesk.ts";
import { encouragementCandidate, hallDay } from "../shared/encouragement.ts";
import { DESK_MENUS } from "../client/src/components/deskMenu.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("trainer desk numbers", () => {
  it("counts only this trainer's open quizzes and paper exams", () => {
    const desk = summarizeTrainerDesk({
      cohorts: [
        { id: "c1", name: "Playgroup", teacherCount: 2, batches: [{ id: "b1", name: "Term 1" }] },
        { id: "c2", name: "Standard 1", teacherCount: 1, batches: [] },
      ],
      quizzes: [
        { status: "open", paperUrl: null },
        { status: "open", paperUrl: "/api/local-objects/paper" },
        { status: "stopped", paperUrl: "/api/local-objects/old" },
      ],
      teacherCount: 3,
      attendanceRate: 80,
      certificateCount: 1,
      upcomingEvents: 2,
      progressPercent: 40,
    });
    assert.equal(desk.cohortCount, 2);
    assert.equal(desk.teacherCount, 3);
    assert.equal(desk.openQuizzes, 1);
    assert.equal(desk.paperExams, 1);
    assert.equal(desk.attendanceRate, 80);
    assert.equal(desk.certificateCount, 1);
    assert.equal(desk.upcomingEvents, 2);
    assert.equal(desk.progressPercent, 40);
    assert.equal(desk.cohorts[0].batches[0].name, "Term 1");
  });

  it("leaves attendance and progress blank when nothing is marked", () => {
    const desk = summarizeTrainerDesk({
      cohorts: [],
      quizzes: [],
      teacherCount: 0,
      attendanceRate: null,
      certificateCount: 0,
      upcomingEvents: 0,
      progressPercent: null,
    });
    assert.equal(desk.cohortCount, 0);
    assert.equal(desk.attendanceRate, null);
    assert.equal(desk.progressPercent, null);
  });
});

describe("quiz audience", () => {
  it("shows a quiz to the whole cohort until specific teachers are chosen", () => {
    assert.equal(quizVisibleToTeacher(undefined, "amina"), true);
    assert.equal(quizVisibleToTeacher([], "amina"), true);
    assert.equal(quizVisibleToTeacher(["amina"], "amina"), true);
    assert.equal(quizVisibleToTeacher(["amina"], "other"), false);
  });
});

describe("exam shape", () => {
  it("treats an uploaded paper and an open document as writing exams", () => {
    assert.equal(isWritingExam({ paperUrl: "/paper.pdf", questions: [{ type: "multiple_choice" }] }), true);
    assert.equal(isWritingExam({ questions: [{ type: "open_ended" }] }), true);
    assert.equal(isWritingExam({ questions: [{ type: "multiple_choice" }, { type: "open_ended" }] }), false);
    assert.equal(isWritingExam({ questions: [] }), false);
    assert.equal(paperPreviewKind("midterm.pdf"), "pdf");
    assert.equal(paperPreviewKind("photo.PNG"), "image");
    assert.equal(paperPreviewKind("answers.docx"), "download");
  });
});

describe("daily encouragement", () => {
  it("changes with the local day in Dar es Salaam", () => {
    assert.equal(hallDay(new Date("2026-10-21T20:30:00Z")), "2026-10-21");
    assert.equal(hallDay(new Date("2026-10-21T21:30:00Z")), "2026-10-22");
  });

  it("gives a trainer the same words all day, and new words to each person and each day", () => {
    const day = "2026-10-21";
    const first = encouragementCandidate({ trainerId: "amina", day, used: [] }, 0);
    assert.equal(encouragementCandidate({ trainerId: "amina", day, used: [] }, 0), first);
    const other = encouragementCandidate({ trainerId: "paul", day, used: [first] }, 0);
    const tomorrow = encouragementCandidate({ trainerId: "amina", day: "2026-10-22", used: [first] }, 0);
    assert.notEqual(other, first);
    assert.notEqual(tomorrow, first);
    assert.equal(first.includes("cohort"), false);
    assert.equal(first.toLowerCase().includes("quiz"), false);
    assert.equal(first.toLowerCase().includes("attendance"), false);

    const used: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 80; i += 1) {
      const line = encouragementCandidate({ trainerId: `trainer-${i}`, day, used }, 0);
      assert.equal(seen.has(line), false);
      seen.add(line);
      used.push(line);
    }
  });
});

describe("trainer desk wiring", () => {
  it("scopes analytics to the signed-in trainer and assigns exams to chosen teachers", () => {
    const storage = read("server/storage.ts");
    const routes = read("server/routes.ts");
    const trainer = read("client/src/pages/trainer-batches.tsx");
    const teacher = read("client/src/pages/teacher-dashboard.tsx");
    const exam = read("client/src/pages/teacher-exam.tsx");
    assert.match(storage, /getAllBatches\(trainerId\)/);
    assert.match(storage, /quizVisibleToTeacher/);
    assert.match(routes, /\/api\/trainer\/desk/);
    assert.match(routes, /\/paper-exam/);
    assert.match(routes, /\/open-exam/);
    assert.match(routes, /teacherIds/);
    assert.match(trainer, /data-testid="trainer-kpis"/);
    assert.match(trainer, /data-testid="trainer-encouragement"/);
    assert.match(trainer, /desk\?\.encouragement/);
    assert.equal(trainer.includes("laid out in colour"), false);
    assert.match(read("server/routes.ts"), /encouragementFor/);
    assert.match(read("server/trainerEncouragement.ts"), /trainer_encouragements/);
    assert.equal(trainer.includes('href="/courses"'), false);
    assert.equal(trainer.includes("button-trainer-courses"), false);
    assert.match(trainer, /link-batch-course-\$\{course\.id\}/);
    // The shell draws the side menu from DESK_MENUS.trainer; the page names the current section and switches it in place.
    assert.match(trainer, /desk="trainer"/);
    assert.match(trainer, /onNavigate=/);
    assert.match(trainer, /DESK_MENUS\.trainer\.map/);
    assert.equal(trainer.includes('data-testid="trainer-sidebar"'), false);
    assert.equal(trainer.includes("button-back-to-desk"), false);
    for (const item of DESK_MENUS.trainer.filter((entry) => entry.href.startsWith("/trainer/batches"))) assert.match(trainer, new RegExp(`\\b${item.key}: render`));
    assert.equal(trainer.includes('id: "assignments"'), false);
    assert.equal(trainer.includes('id: "certificates"'), false);
    assert.equal(trainer.includes('id: "assessments", label: "Assessments", icon'), false);
    assert.equal(trainer.includes('id: "quizzes", label: "Quizzes", icon'), false);
    assert.equal(trainer.includes('id: "teachers", label: "Teachers", icon'), false);
    assert.match(trainer, /new URLSearchParams\(search\)\.get\("tab"\)/);
    assert.match(trainer, /data-testid="trainer-quizzes"/);
    assert.match(trainer, /data-testid="trainer-assessments"/);
    assert.match(trainer, /dueDate: deadlineIso/);
    assert.match(trainer, /Save deadline/);
    assert.match(trainer, /\/api\/assigned-quizzes\/\$\{quizId\}/);
    assert.match(routes, /parseDeadline\(req\.body\?\.dueDate\)/);
    assert.match(routes, /hasOwnProperty\.call\(req\.body \|\| \{\}, "dueDate"\)/);
    assert.match(routes, /\/api\/batches\/:batchId\/assignments\/:assignmentId/);
    assert.equal(trainer.includes("Adult teachers"), false);
    assert.match(trainer, /button-upload-exam/);
    assert.match(trainer, /check-quiz-teacher-/);
    assert.match(teacher, /teacher\/exams\//);
    assert.match(exam, /data-testid="exam-split"/);
    assert.match(exam, /data-testid="exam-answers"/);
  });
});
