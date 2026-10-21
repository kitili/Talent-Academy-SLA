import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRemovableStaff, isRemovableTeacher, removalSteps } from "../server/deskRoster.ts";

describe("inactive desks are deleted, not kept", () => {
  it("removes the folded trainer desks and keeps the live ones", () => {
    assert.equal(isRemovableStaff({ username: "trainer2", role: "trainer", approvalStatus: "inactive" }), true);
    assert.equal(isRemovableStaff({ username: "anthonia.trainer", role: "trainer", approvalStatus: "inactive" }), true);
    assert.equal(isRemovableStaff({ username: "trainer1", role: "trainer", approvalStatus: "inactive" }), false);
    assert.equal(isRemovableStaff({ username: "admin", role: "admin", approvalStatus: "inactive" }), false);
    assert.equal(isRemovableStaff({ username: "test.admin", role: "admin", approvalStatus: "inactive" }), false);
    assert.equal(isRemovableStaff({ username: "new.trainer", role: "trainer", approvalStatus: "approved" }), false);
  });

  it("removes inactive teachers and keeps teacher@test.com", () => {
    assert.equal(isRemovableTeacher({ email: "someone@silverleaf.co.tz", approvalStatus: "inactive" }), true);
    assert.equal(isRemovableTeacher({ email: "teacher@test.com", approvalStatus: "inactive" }), false);
    assert.equal(isRemovableTeacher({ email: "new.teacher@school.com", approvalStatus: "approved" }), false);
  });

  it("moves ownership to the admin and deletes a person's own rows", () => {
    const steps = removalSteps([
      { table: "batches", column: "created_by", nullable: false },
      { table: "batches", column: "trainer_id", nullable: true },
      { table: "attendance_records", column: "marked_by", nullable: true },
      { table: "user_profiles", column: "user_id", nullable: false },
      { table: "quiz_attempts", column: "user_id", nullable: true },
      { table: "bad name", column: "user_id", nullable: false },
    ]);
    assert.deepEqual(
      steps.map((step) => [step.table, step.column, step.action]),
      [
        ["batches", "created_by", "reassign"],
        ["batches", "trainer_id", "reassign"],
        ["attendance_records", "marked_by", "reassign"],
        ["user_profiles", "user_id", "delete"],
        ["quiz_attempts", "user_id", "delete"],
      ],
    );
  });
});
