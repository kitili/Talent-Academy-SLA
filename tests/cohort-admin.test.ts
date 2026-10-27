import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { courseHealth, quizStoppedReason, teacherMayTakeQuiz } from "../server/cohortAccess.ts";
import { LEARNING_BATCHES } from "../shared/tanzaniaPath.ts";
import { TEST_LOGINS } from "../server/testLogins.ts";

describe("cohort access", () => {
  it("stops a quiz when the cohort is closed, quizzes are stopped, or that quiz is stopped", () => {
    assert.equal(quizStoppedReason({ status: "open", quizzesStatus: "open" }), null);
    assert.equal(quizStoppedReason({ status: "closed", quizzesStatus: "open" }), "This cohort is closed");
    assert.equal(quizStoppedReason({ status: "open", quizzesStatus: "stopped" }), "Quizzes are stopped for this cohort");
    assert.equal(quizStoppedReason({ status: "open", quizzesStatus: "open" }, "stopped"), "This quiz is stopped");
  });

  it("lets a teacher through when one of their cohorts for the course is still open", () => {
    assert.equal(teacherMayTakeQuiz([]), "You are not in a cohort for this course");
    assert.equal(teacherMayTakeQuiz([{ status: "closed", quizzesStatus: "open" }]), "This cohort is closed");
    assert.equal(
      teacherMayTakeQuiz([
        { status: "closed", quizzesStatus: "open" },
        { status: "open", quizzesStatus: "open" },
      ]),
      null,
    );
  });

  it("marks a course from its learners and completion", () => {
    assert.equal(courseHealth({ publishStatus: "draft", enrolledTeachers: 4, completionPercentage: 90 }), "draft");
    assert.equal(courseHealth({ publishStatus: "published", enrolledTeachers: 0, completionPercentage: 0 }), "waiting");
    assert.equal(courseHealth({ publishStatus: "published", enrolledTeachers: 3, completionPercentage: 40 }), "at-risk");
    assert.equal(courseHealth({ publishStatus: "published", enrolledTeachers: 3, completionPercentage: 90 }), "on-track");
  });
});

describe("desk roster", () => {
  it("keeps trainer1 and teacher@test.com as the only learner desks", () => {
    assert.deepEqual(
      TEST_LOGINS.filter((login) => login.role === "trainer").map((login) => login.username),
      ["trainer1"],
    );
    assert.equal(TEST_LOGINS.find((login) => login.username === "trainer1")?.password, "trainer123");
    assert.deepEqual(
      TEST_LOGINS.filter((login) => login.role === "teacher").map((login) => login.email),
      ["teacher@test.com"],
    );
    assert.equal(LEARNING_BATCHES.every((batch) => batch.trainerUsername === "trainer1"), true);
  });
});
