import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cohortMedals, nextCourseToCheck } from "../shared/cohortMedals.ts";
import { applyModuleLocks } from "../server/progressLogic.ts";

const quiet = {
  progressPercentage: 0,
  coursesCompleted: 0,
  attendanceRate: 0,
  attendanceDays: 0,
  questionsAnswered: 0,
  quizzesPassed: 0,
  trainerStar: false,
};

describe("cohort medals", () => {
  it("keeps every medal locked until the work is there", () => {
    const medals = cohortMedals(quiet);
    assert.equal(medals.length, 7);
    assert.equal(medals.every((medal) => medal.earned === false), true);
  });

  it("gives a first step once the teacher has started", () => {
    const medals = cohortMedals({ ...quiet, attendanceDays: 1, attendanceRate: 50 });
    assert.equal(medals.find((medal) => medal.kind === "first-step")?.earned, true);
    assert.equal(medals.find((medal) => medal.kind === "keeping-time")?.earned, false);
  });

  it("gives keeping time, answers, a quiz pass, and strong progress from the record", () => {
    const medals = cohortMedals({
      ...quiet,
      progressPercentage: 70,
      attendanceRate: 90,
      attendanceDays: 4,
      questionsAnswered: 2,
      quizzesPassed: 1,
    });
    for (const kind of ["first-step", "keeping-time", "questions", "quiz-pass", "strong-progress"]) {
      assert.equal(medals.find((medal) => medal.kind === kind)?.earned, true, kind);
    }
    assert.equal(medals.find((medal) => medal.kind === "course-done")?.earned, false);
    assert.equal(medals.find((medal) => medal.kind === "trainer-star")?.earned, false);
  });

  it("gives the course medal only after a course is checked complete, and the star only when the trainer gives it", () => {
    const medals = cohortMedals({ ...quiet, coursesCompleted: 1, trainerStar: true });
    assert.equal(medals.find((medal) => medal.kind === "course-done")?.earned, true);
    assert.equal(medals.find((medal) => medal.kind === "trainer-star")?.earned, true);
    assert.equal(medals.find((medal) => medal.kind === "strong-progress")?.earned, true);
  });

  it("opens the next course only after the one before it is checked", () => {
    assert.equal(nextCourseToCheck(["a", "b", "c"], []), "a");
    assert.equal(nextCourseToCheck(["a", "b", "c"], ["a"]), "b");
    assert.equal(nextCourseToCheck(["a", "b"], ["a", "b"]), null);
    const weeks = applyModuleLocks([
      { courseId: "a", courseName: "Course A", weekNumber: 1, progress: { percentage: 40, total: 2 } },
      { courseId: "b", courseName: "Course B", weekNumber: 1, progress: { percentage: 0, total: 1 } },
    ], ["a"]);
    const byId = Object.fromEntries(weeks.map((week) => [week.courseId, week]));
    assert.equal(byId.a.locked, false);
    assert.equal(byId.b.locked, false);
  });
});
