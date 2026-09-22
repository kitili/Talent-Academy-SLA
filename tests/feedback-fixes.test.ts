import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyModuleLocks,
  moduleIsComplete,
  batchRiskStatus,
  isAtRiskFellow,
  moduleCoveragePercentage,
  isCourseComplete,
  scoreQuizSubmission,
  teachersWhoCompletedEachCourse,
  formatCourseProgress,
} from "../server/progressLogic.ts";

describe("Taleemabad feedback: quiz scoring", () => {
  it("passes when 70% of graded questions are correct and ignores unanswered open-ended", () => {
    const questions = [
      { id: "q1", type: "multiple_choice", correctAnswer: "A" },
      { id: "q2", type: "multiple_choice", correctAnswer: "B" },
      { id: "q3", type: "true_false", correctAnswer: "True" },
      { id: "q4", type: "true_false", correctAnswer: "False" },
      { id: "q5", type: "open_ended", correctAnswer: "" },
    ];
    const result = scoreQuizSubmission(questions, {
      q1: "A",
      q2: "B",
      q3: "True",
      q4: "True",
      q5: "any written answer",
    });
    assert.equal(result.score, 3);
    assert.equal(result.totalQuestions, 4);
    assert.equal(result.passed, true);
    assert.equal(result.percentage, 75);
  });

  it("does not fail a mixed quiz just because open-ended has no auto answer", () => {
    const questions = [
      { id: "q1", type: "multiple_choice", correctAnswer: "A" },
      { id: "q2", type: "multiple_choice", correctAnswer: "B" },
      { id: "q3", type: "open_ended", correctAnswer: "" },
      { id: "q4", type: "open_ended", correctAnswer: "" },
    ];
    const result = scoreQuizSubmission(questions, {
      q1: "A",
      q2: "B",
      q3: "reflection",
      q4: "another reflection",
    });
    assert.equal(result.passed, true);
    assert.equal(result.score, 2);
    assert.equal(result.totalQuestions, 2);
  });

  it("fails when graded score is below 70%", () => {
    const questions = [
      { id: "q1", type: "multiple_choice", correctAnswer: "A" },
      { id: "q2", type: "multiple_choice", correctAnswer: "B" },
      { id: "q3", type: "multiple_choice", correctAnswer: "C" },
    ];
    const result = scoreQuizSubmission(questions, { q1: "A", q2: "X", q3: "X" });
    assert.equal(result.passed, false);
    assert.equal(result.percentage, 33);
  });

  it("passes all-open-ended quizzes when every prompt is answered", () => {
    const questions = [
      { id: "q1", type: "open_ended", correctAnswer: "" },
      { id: "q2", type: "open_ended", correctAnswer: "" },
    ];
    assert.equal(scoreQuizSubmission(questions, { q1: "one", q2: "two" }).passed, true);
    assert.equal(scoreQuizSubmission(questions, { q1: "one", q2: "  " }).passed, false);
  });
});

describe("Taleemabad feedback: module unlock", () => {
  it("locks module 2 until module 1 is 100% complete", () => {
    const weeks = applyModuleLocks([
      { courseId: "c1", courseName: "Induction", weekNumber: 1, progress: { percentage: 50 } },
      { courseId: "c1", courseName: "Induction", weekNumber: 2, progress: { percentage: 0 } },
    ]);
    assert.equal(weeks[0].locked, false);
    assert.equal(weeks[1].locked, true);
  });

  it("unlocks module 2 after module 1 is complete, including one-day courses", () => {
    const weeks = applyModuleLocks([
      { courseId: "c1", courseName: "One-day course", weekNumber: 1, progress: { percentage: 100 } },
      { courseId: "c1", courseName: "One-day course", weekNumber: 2, progress: { percentage: 0 } },
    ]);
    assert.equal(weeks[0].locked, false);
    assert.equal(weeks[1].locked, false);
  });

  it("unlocks module 2 when module 1 has no files", () => {
    const weeks = applyModuleLocks([
      { courseId: "c1", courseName: "Induction", weekNumber: 1, progress: { percentage: 0, total: 0 } },
      { courseId: "c1", courseName: "Induction", weekNumber: 2, progress: { percentage: 0, total: 1 } },
    ]);
    assert.equal(moduleIsComplete({ total: 0, percentage: 0 }), true);
    assert.equal(weeks[0].locked, false);
    assert.equal(weeks[1].locked, false);
  });

  it("locks the next course until the previous course is complete", () => {
    const weeks = applyModuleLocks([
      { courseId: "a", courseName: "Course A", weekNumber: 1, progress: { percentage: 50, total: 2 } },
      { courseId: "b", courseName: "Course B", weekNumber: 1, progress: { percentage: 0, total: 1 } },
    ]);
    const byId = Object.fromEntries(weeks.map(week => [week.courseId, week]));
    assert.equal(byId.a.locked, false);
    assert.equal(byId.b.locked, true);
  });
});

describe("Taleemabad feedback: cohort status and coverage", () => {
  it("does not mark empty or untracked batches as at risk", () => {
    assert.equal(batchRiskStatus(0, 0), "on-track");
    assert.equal(batchRiskStatus(3, 80), "on-track");
    assert.equal(batchRiskStatus(3, 40), "at-risk");
  });

  it("does not treat a finished one-module course as at-risk", () => {
    assert.equal(isAtRiskFellow(1, 1), false);
    assert.equal(isAtRiskFellow(5, 1), true);
    assert.equal(isAtRiskFellow(0, 0), false);
  });

  it("reports completion by modules, not a weekly assumption", () => {
    assert.equal(moduleCoveragePercentage(1, 1), 100);
    assert.equal(moduleCoveragePercentage(1, 2), 50);
    assert.equal(isCourseComplete(1, 1), true);
    assert.equal(isCourseComplete(0, 1), false);
    assert.equal(isCourseComplete(9, 10), true);
  });

  it("lists which teachers completed each course", () => {
    const grouped = teachersWhoCompletedEachCourse([
      { courseName: "Induction", teacherName: "Amina", status: "completed" },
      { courseName: "Induction", teacherName: "John", status: "in_progress" },
      { courseName: "One-day course", teacherName: "Amina", status: "completed" },
    ]);
    assert.deepEqual(grouped, [
      { courseName: "Induction", teachers: ["Amina"] },
      { courseName: "One-day course", teachers: ["Amina"] },
    ]);
    assert.equal(formatCourseProgress("completed", 1, 1), "Completed");
    assert.equal(formatCourseProgress("in_progress", 1, 2), "1/2 modules");
  });
});
