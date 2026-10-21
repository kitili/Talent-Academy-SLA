import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAcademyStaff, trainerOwnsBatch } from "../server/access.ts";
import { TRAINER_TOUR } from "../shared/guidedTour.ts";

describe("role boundaries", () => {
  it("treats admin and trainer as staff, and a teacher as a learner", () => {
    assert.equal(isAcademyStaff({ role: "admin" }), true);
    assert.equal(isAcademyStaff({ role: "trainer" }), true);
    assert.equal(isAcademyStaff({ role: "teacher" }), false);
    assert.equal(isAcademyStaff(null), false);
  });

  it("lets a trainer open only cohorts assigned to them", () => {
    const trainer = { id: "t1", role: "trainer" };
    const own = { trainerId: "t1", createdBy: "admin" };
    const created = { trainerId: null, createdBy: "t1" };
    const other = { trainerId: "t2", createdBy: "admin" };
    assert.equal(trainerOwnsBatch(trainer, own), true);
    assert.equal(trainerOwnsBatch(trainer, created), true);
    assert.equal(trainerOwnsBatch(trainer, other), false);
    assert.equal(trainerOwnsBatch(trainer, null), false);
    assert.equal(trainerOwnsBatch(trainer, { trainerId: "t2", createdBy: "admin", trainerIds: ["t1"] }), true);
  });

  it("lets an admin open any cohort and hides cohorts from teachers", () => {
    const batch = { trainerId: "t1", createdBy: "admin" };
    assert.equal(trainerOwnsBatch({ id: "a", role: "admin" }, batch), true);
    assert.equal(trainerOwnsBatch({ id: "learner", role: "teacher" }, batch), false);
  });
});

describe("trainer tour", () => {
  it("shows cohorts, teachers, and lesson documents", () => {
    const text = TRAINER_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
    assert.ok(text.includes("cohort"));
    assert.ok(text.includes("Teachers"));
    assert.ok(text.includes("Courses"));
    assert.equal(TRAINER_TOUR.some((step) => step.target === "trainer-batches"), true);
    assert.equal(text.toLowerCase().includes("trainer123"), false);
  });
});
