import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_TOUR,
  TEACHER_TOUR,
} from "../shared/guidedTour.ts";
import {
  ACTIVITY_AREAS,
  FRESH_START_PHRASE,
  KEPT_LOGIN_TABLES,
  PROTECTED_TABLES,
  assertFreshStartIsSafe,
  buildActivityStatements,
  parseActivityScope,
} from "../server/freshStart.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("fresh start keeps logins and stays scoped", () => {
  it("never clears users, teachers, courses, sessions, or approval history", () => {
    assertFreshStartIsSafe();
    for (const table of ["users", "teachers", "user_profiles", "teacher_profiles", "approval_history", "courses", "sessions"]) {
      assert.equal(KEPT_LOGIN_TABLES.includes(table as typeof KEPT_LOGIN_TABLES[number]) || PROTECTED_TABLES.includes(table as typeof PROTECTED_TABLES[number]), true);
    }
    const statements = buildActivityStatements(
      { areas: [...ACTIVITY_AREAS], teacherIds: ["teacher-1"], trainerIds: ["trainer-1"] },
      ["batch-1"],
    );
    for (const step of statements) {
      assert.match(step.sql, /\bWHERE\b/);
      for (const table of PROTECTED_TABLES) {
        assert.equal(step.sql.includes(`public.${table}`), false);
      }
    }
  });

  it("clears one area for one person and leaves the rest of the academy", () => {
    const scope = parseActivityScope({
      confirm: "CLEAR ACTIVITY",
      areas: ["notices"],
      teacherIds: ["teacher-1"],
      trainerIds: [],
    });
    assert.equal("error" in scope, false);
    if ("error" in scope) return;
    const statements = buildActivityStatements(scope, []);
    assert.equal(statements.length, 1);
    assert.equal(statements[0].table, "notifications");
    assert.match(statements[0].sql, /recipient_id = ANY/);
    assert.deepEqual(statements[0].params, [["teacher-1"]]);
  });

  it("refuses a whole-academy wipe", () => {
    const missingPeople = parseActivityScope({ confirm: "CLEAR ACTIVITY", areas: ["quizzes"] });
    assert.equal("error" in missingPeople, true);
    const missingAreas = parseActivityScope({ confirm: "CLEAR ACTIVITY", teacherIds: ["teacher-1"] });
    assert.equal("error" in missingAreas, true);
    const unknown = parseActivityScope({
      confirm: "CLEAR ACTIVITY",
      areas: ["courses"],
      teacherIds: ["teacher-1"],
    });
    assert.equal("error" in unknown, true);
    const phrase = parseActivityScope({
      confirm: "please",
      areas: ["notices"],
      teacherIds: ["teacher-1"],
    });
    assert.equal("error" in phrase, true);
  });

  it("offers cohorts, progress, quizzes, certificates, and notices on their own", () => {
    assert.deepEqual(ACTIVITY_AREAS, ["cohorts", "progress", "quizzes", "certificates", "notices"]);
    const scope = parseActivityScope({
      confirm: FRESH_START_PHRASE,
      areas: ["cohorts"],
      trainerIds: ["trainer-1"],
    });
    assert.equal("error" in scope, false);
    if ("error" in scope) return;
    const statements = buildActivityStatements(scope, ["batch-1"]);
    assert.equal(statements.some((step) => step.table === "batches" && step.sql.includes("WHERE id = ANY")), true);
    assert.equal(statements.some((step) => step.table === "courses"), false);
    assert.equal(statements.some((step) => step.table === "sessions"), false);
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
    assert.equal(text.includes("Handover"), false);
    for (const target of [
      "admin-header",
      "admin-tour",
      "admin-bell",
      "admin-logout",
      "admin-nav",
      "admin-nav-desk",
      "admin-nav-approvals",
      "admin-nav-trainers",
      "admin-nav-teachers",
      "admin-nav-cohorts",
      "admin-nav-analytics",
      "admin-notice",
      "admin-password",
      "admin-fresh",
    ]) {
      assert.equal(ADMIN_TOUR.some((step) => step.target === target), true, target);
    }
  });

  it("leaves the highlighted control readable", () => {
    const tour = readFileSync(join(root, "client/src/components/GuidedTour.tsx"), "utf8");
    const css = readFileSync(join(root, "client/src/index.css"), "utf8");
    assert.equal(tour.includes("bg-slate-950/55"), false);
    assert.match(tour, /rgba\(16, 36, 72, 0\.14\)/);
    assert.match(tour, /pointer-events-none/);
    assert.match(tour, /pointer-events-auto/);
    assert.equal(css.includes("z-index: 81"), false);
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
