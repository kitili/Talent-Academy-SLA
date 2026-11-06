import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEADLINE_PASSED, fellowStillSees, isPastDue } from "../../../shared/academyPath.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");

function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

const now = new Date("2026-10-29T12:00:00Z");

describe("a deadline", () => {
  it("has passed at and after its moment, and never when there is none", () => {
    assert.equal(isPastDue("2026-10-29T12:00:00Z", now), true);
    assert.equal(isPastDue(new Date("2026-10-29T11:59:00Z"), now), true);
    assert.equal(isPastDue("2026-10-29T12:01:00Z", now), false);
    assert.equal(isPastDue(null, now), false);
    assert.equal(isPastDue("", now), false);
    assert.equal(isPastDue("not a date", now), false);
  });

  it("keeps the old list rule working for the Fellow page, the only reader left until task T2-F", () => {
    assert.match(source("client/src/pages/teacher-dashboard.tsx"), /fellowStillSees/);
    assert.doesNotMatch(routes, /fellowStillSees/);
    assert.equal(fellowStillSees("2026-10-28T00:00:00Z", false, now), false);
    assert.equal(fellowStillSees("2026-10-28T00:00:00Z", true, now), true);
    assert.equal(fellowStillSees("2026-10-30T00:00:00Z", false, now), true);
    assert.equal(fellowStillSees(null, false, now), true);
  });
});

describe("the Fellow routes keep to each Fellow's effective deadline", () => {
  it("lists every item assigned, past due or not, through the rows that cut a closed untried item down", () => {
    const quizzes = route(routes, "get", "/api/teacher/quizzes");
    assert.match(quizzes, /res\.json\(quizzes\.map\(\(quiz\) => fellowQuizItem\(quiz, reopened\[quiz\.id\], tried\.has\(quiz\.id\), now\)\)\)/);
    assert.match(quizzes, /getDeadlineReopeningsForTeacher\("quiz", req\.teacherId!\)/);
    const assignments = route(routes, "get", "/api/teacher/assignments");
    assert.match(assignments, /res\.json\(rows\.map\(\(row\) => fellowAssignmentItem\(row, reopened\[row\.id\], now\)\)\)/);
    assert.match(assignments, /getDeadlineReopeningsForTeacher\("assignment", req\.teacherId!\)/);
  });

  it("refuses answers once the Fellow's own deadline passes (410), reading only that Fellow's row", () => {
    const quiz = route(routes, "post", "/api/assigned-quizzes/:quizId/submit");
    assert.match(quiz, /getDeadlineReopening\("quiz", quiz\.id, req\.teacherId!\)/);
    assert.match(quiz, /if \(isPastDue\(effectiveDeadline\(quiz\.dueDate, reopened\)\)\) return res\.status\(410\)\.json\(\{ error: DEADLINE_PASSED \}\)/);
    const assignment = route(routes, "post", "/api/teacher/assignments/:assignmentId/submit");
    assert.match(assignment, /getDeadlineReopening\("assignment", req\.params\.assignmentId, req\.teacherId!\)/);
    assert.match(assignment, /if \(isPastDue\(effectiveDeadline\(assignment\?\.dueDate, reopened\)\)\) return res\.status\(410\)/);
  });

  it("checks the audience before the deadline, so a stranger cannot learn the date", () => {
    for (const [verb, path] of [["get", "/api/assigned-quizzes/:quizId"], ["post", "/api/assigned-quizzes/:quizId/submit"]]) {
      const body = route(routes, verb, path);
      assert.ok(body.indexOf("This exam is not assigned to you") < body.indexOf("410"), `${verb} ${path}`);
    }
  });

  it("opens a closed exam only to review the Fellow's own tries, and sends their own deadline", () => {
    const open = route(routes, "get", "/api/assigned-quizzes/:quizId");
    assert.match(open, /fellowDeadline\(quiz\.dueDate, await storage\.getDeadlineReopening\("quiz", quiz\.id, req\.teacherId!\)\)/);
    assert.match(open, /if \(closed\) \{/);
    assert.match(open, /if \(tries\.length === 0\) return res\.status\(410\)/);
    assert.match(open, /res\.json\(\{ \.\.\.quiz, dueDate, closed, questions: learnerQuestions\(questions\)/);
  });

  it("does not hand a closed untried quiz over through the attempt read, which has no deadline check of its own", () => {
    const attempts = route(routes, "get", "/api/assigned-quizzes/:quizId/attempts");
    assert.match(attempts, /quizForAttemptRead\(stored, \{ tried, sits, reopenedDue:/);
    assert.match(attempts, /getAssignedQuizzesForTeacher\(req\.teacherId!\)/);
    assert.doesNotMatch(attempts, /attemptQuizView\(stored/);
  });

  it("no Fellow route reads the item's own due date without their row", () => {
    assert.doesNotMatch(routes, /isPastDue\((quiz\.dueDate|assignment\?\.dueDate|row\.due_date)\)/);
  });

  it("says so in words", () => {
    assert.equal(DEADLINE_PASSED, "The deadline has passed");
  });
});

describe("times read by raw SQL", () => {
  it("are marked as the UTC they are stored in, so a browser in another zone reads the right moment", async () => {
    const { utcTimestamps } = await import("../../../server/storage.ts");
    const [row] = utcTimestamps([{ due_date: "2026-10-29 13:46:08.395", title: "x", end_date: null }], ["due_date", "end_date"]);
    assert.equal(row.due_date, "2026-10-29T13:46:08.395Z");
    assert.equal(row.end_date, null);
    const [kept] = utcTimestamps([{ due_date: "2026-10-29T13:46:08.395Z" }], ["due_date"]);
    assert.equal(kept.due_date, "2026-10-29T13:46:08.395Z");
  });
});
