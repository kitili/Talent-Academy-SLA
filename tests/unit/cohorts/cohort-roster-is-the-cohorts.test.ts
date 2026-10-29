import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { rosterChanges } from "../../../server/cohortRoster.ts";
import { cohortFellows, type PathCohort } from "../../../client/src/components/AdminParts.tsx";

/**
 * The Admin cohort page used to count only the Fellows ticked on a step, so a Fellow a Trainer registered or enrolled
 * (a `batch_teachers` row) never showed. The server now sends the cohort's own roster, the page reads it, and saving the
 * roster changes the cohort.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const cohort = (extra: Partial<PathCohort> = {}): PathCohort => ({ id: "c1", name: "Cohort", batches: [], ...extra });

describe("the cohort roster", () => {
  it("adds Fellows newly ticked and removes Fellows no longer ticked", () => {
    assert.deepEqual(rosterChanges({ current: ["a", "b"], wanted: ["b", "c"] }), { add: ["c"], remove: ["a"] });
    assert.deepEqual(rosterChanges({ current: [], wanted: ["a", "a"] }), { add: ["a"], remove: [] });
    assert.deepEqual(rosterChanges({ current: ["a"], wanted: ["a"] }), { add: [], remove: [] });
  });

  it("shows the cohort's enrolled Fellows, not only those ticked on a step", () => {
    const registered = cohort({ fellows: [{ id: "f1", name: "Registered by a Trainer" }] });
    assert.deepEqual(cohortFellows(registered).map((row) => row.id), ["f1"]);
    const stepOnly = cohort({ batches: [{ id: "s1", name: "Batch One", courses: [], teachers: [{ id: "f2", name: "Step tick" }] }] });
    assert.deepEqual(cohortFellows(stepOnly).map((row) => row.id), ["f2"]);
  });

  it("is sent by the server and saved by an Admin-only route", () => {
    const routes = source("server/academyPathRoutes.ts");
    assert.match(routes, /fellows: enrolments/);
    assert.match(routes, /app\.put\("\/api\/admin\/academy-path\/cohorts\/:cohortId\/teachers", isAuthenticated, isAdmin/);
    assert.match(routes, /rosterChanges\(\{ current:/);
  });

  it("is what the cohort page ticks, and a first course starts the first part by itself", () => {
    const page = source("client/src/pages/admin-batches.tsx");
    assert.match(page, /cohorts\/\$\{cohortId\}\/teachers/);
    assert.match(page, /check-roster-/);
    assert.match(page, /select-add-course-/);
    assert.match(page, /nextBatchName\(0\)/);
    assert.equal(page.includes("disabled={batches.length === 0}>"), false);
  });
});
