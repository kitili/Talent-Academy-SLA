import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_TOUR,
  TEACHER_TOUR,
} from "../shared/guidedTour.ts";
import {
  FRESH_START_PHRASE,
  KEPT_LOGIN_TABLES,
  CLEARED_ACTIVITY_TABLES,
  activityDeleteSql,
  assertFreshStartIsSafe,
} from "../server/freshStart.ts";

describe("fresh start keeps logins", () => {
  it("never clears users, teachers, or their profiles", () => {
    assertFreshStartIsSafe();
    for (const table of ["users", "teachers", "user_profiles", "teacher_profiles"]) {
      assert.equal(KEPT_LOGIN_TABLES.includes(table as typeof KEPT_LOGIN_TABLES[number]), true);
      assert.throws(() => activityDeleteSql(table), /Refusing to clear/);
    }
  });

  it("clears courses, progress, and sessions so import can start clean", () => {
    for (const table of ["courses", "quiz_attempts", "teacher_content_progress", "batches", "sessions", "desk_messages"]) {
      assert.equal(CLEARED_ACTIVITY_TABLES.includes(table as typeof CLEARED_ACTIVITY_TABLES[number]), true);
      assert.equal(activityDeleteSql(table), `DELETE FROM public.${table}`);
    }
  });

  it("requires an explicit confirmation phrase", () => {
    assert.equal(FRESH_START_PHRASE, "CLEAR ACTIVITY");
  });
});

describe("in-app tours", () => {
  it("walks an admin from the desk to courses and a fresh start", () => {
    const text = ADMIN_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
    assert.ok(text.includes("Approvals"));
    assert.ok(text.includes("Courses"));
    assert.ok(text.includes("Cohorts"));
    assert.ok(text.includes("CLEAR ACTIVITY"));
    assert.equal(ADMIN_TOUR.some((step) => step.target === "admin-nav"), true);
  });

  it("walks a teacher from continue learning to certificates", () => {
    const text = TEACHER_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
    assert.ok(text.includes("Resume"));
    assert.ok(text.includes("My learning") || text.includes("assigned course"));
    assert.ok(text.includes("Certificates"));
    assert.equal(TEACHER_TOUR.some((step) => step.target === "teacher-certificates"), true);
  });

  it("does not put passwords in the tour script", () => {
    const text = [...ADMIN_TOUR, ...TEACHER_TOUR].map((step) => step.body).join(" ").toLowerCase();
    assert.equal(text.includes("admin123"), false);
    assert.equal(text.includes("password is"), false);
  });
});
