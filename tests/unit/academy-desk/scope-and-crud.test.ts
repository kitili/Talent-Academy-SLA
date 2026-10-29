import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Text contracts: route handlers call `storage` and `db` directly, so these prove each rule is written in the route
 * that enforces it. The behaviour is run in scripts/workflow-walkthrough.ts against a throwaway database.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");
const storage = source("server/storage.ts");
const desk = source("server/academyDesk.ts");

function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

function method(text: string, name: string) {
  const start = text.indexOf(`  async ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  return text.slice(start, text.indexOf("\n  }\n", start));
}

describe("a Trainer acts only on their own cohorts and Fellows", () => {
  it("resets a password only for a Fellow they teach", () => {
    assert.match(route(routes, "post", "/api/trainer/reset-teacher-password"), /if \(!\(await staffTeachesFellow\(req\.user, teacherId\)\)\)/);
  });

  it("marks attendance only in their cohort, and only for Fellows enrolled in it", () => {
    const mark = route(routes, "post", "/api/batches/:batchId/attendance");
    assert.match(mark, /if \(!staffCanAccessBatch\(req\.user, batch\)\) return res\.status\(403\)/);
    assert.match(mark, /!enrolled\.has\(record\.teacherId\)/);
  });

  it("announces, disqualifies and comments only within their cohorts", () => {
    assert.match(route(routes, "post", "/api/batches/:batchId/announce"), /staffCanAccessBatch\(req\.user, batch\)/);
    const disqualify = route(routes, "post", "/api/fellows/:teacherId/disqualify");
    assert.match(disqualify, /staffCanAccessBatch\(req\.user, batch\)/);
    assert.match(disqualify, /That Fellow is not in this cohort/);
    assert.match(route(routes, "post", "/api/trainer/comments"), /staffTeachesFellow\(req\.user, String\(teacherId\)\)/);
  });

  it("marks open answers from the attempt itself, in a cohort they teach", () => {
    const review = route(routes, "post", "/api/quiz-attempts/:attemptId/review-open-ended");
    assert.match(review, /getTeacherQuizAttemptById\(req\.params\.attemptId\)/);
    assert.match(review, /staffCanAccessBatch\(req\.user, batch\)/);
    assert.match(review, /teacherId: attempt\.teacherId/);
    assert.doesNotMatch(review, /review\.teacherId/);
  });

  it("writes desk mail only to someone the sender may reach", () => {
    const send = route(routes, "post", "/api/desk-messages");
    assert.match(send, /if \(fromRole === "teacher" \|\| !\(await storage\.getTeacher\(toId\)\)\)/);
    assert.match(send, /staffTeachesFellow\(req\.user, toId\)/);
    assert.match(send, /recipient\.role !== toRole/);
  });

  it("leaves alert rules and course repeats to the Admin", () => {
    assert.match(route(routes, "post", "/api/alert-rules"), /isAuthenticated, isAdmin/);
    assert.match(route(routes, "delete", "/api/alert-rules/:id"), /isAuthenticated, isAdmin/);
    assert.match(route(routes, "post", "/api/course-repetitions"), /isAuthenticated, isAdmin/);
  });
});

describe("removing a person keeps the academy's records", () => {
  it("makes a Fellow inactive and takes them off rosters, without deleting the row", () => {
    const remove = method(storage, "dismissTeacher");
    assert.match(remove, /approvalStatus: "inactive"/);
    assert.match(remove, /delete\(batchTeachers\)/);
    assert.doesNotMatch(remove, /delete\(teachers\)/);
  });

  it("makes a Trainer inactive instead of cascading through their cohorts and exams", () => {
    const remove = method(storage, "dismissUser");
    assert.match(remove, /approvalStatus: "inactive"/);
    assert.doesNotMatch(remove, /delete\(users\)/);
  });

  it("enrols a Fellow in a cohort once", () => {
    assert.match(method(storage, "addTeacherToBatch"), /if \(existing\) return existing;/);
  });
});

describe("assessments, exams and courses can be changed and removed", () => {
  it("edits an assessment's title, instructions, deadline or audience, and deletes it within its cohort", () => {
    const edit = route(routes, "patch", "/api/batches/:batchId/assignments/:assignmentId");
    assert.match(edit, /has\("title"\)/);
    assert.match(edit, /has\("instructions"\)/);
    assert.match(edit, /replaceWrittenAssignmentAudience/);
    const remove = route(routes, "delete", "/api/batches/:batchId/assignments/:assignmentId");
    assert.match(remove, /staffCanAccessBatch\(req\.user, batch\)/);
    assert.match(remove, /assignment\.batchId !== batch\.id/);
    assert.match(method(storage, "deleteWrittenAssignment"), /delete\(writtenAssignmentTeachers\)/);
  });

  it("edits an exam's title and pass mark, refusing a mark outside 1 to 100", () => {
    const edit = route(routes, "patch", "/api/assigned-quizzes/:quizId");
    assert.match(edit, /details\.title = /);
    assert.match(edit, /mark < 1 \|\| mark > 100/);
  });
});

describe("lists that grow", () => {
  it("sends the timetable from two weeks back by default and older sessions only when asked", () => {
    const timetable = route(desk, "get", "/api/timetable");
    assert.match(timetable, /const past = req\.query\.past === "1"/);
    assert.match(timetable, /now\(\) - interval '14 days'/);
    assert.match(timetable, /\.limit\(past \? 200 : 1000\)/);
  });

  it("pages the Approvals history and keeps the two notification lists apart", () => {
    const approvals = source("client/src/pages/approvals.tsx");
    assert.match(approvals, /approval-history\?page=\$\{historyPage\}/);
    assert.match(approvals, /<PageStrip page=\{history\.page\}/);
    assert.match(source("client/src/components/NotificationBell.tsx"), /queryKey: \["\/api\/notifications", \{ limit: 30 \}\]/);
    assert.match(source("client/src/pages/teacher-dashboard.tsx"), /queryKey: \["\/api\/notifications", \{ limit: 8 \}\]/);
  });
});
