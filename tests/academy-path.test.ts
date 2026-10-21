import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMY_TERMS,
  batchIsComplete,
  cohortIsComplete,
  normalizeCohortsRequired,
  pathSummary,
} from "../shared/academyPath.ts";

describe("academy path", () => {
  it("names cohort, batch, and course as different things", () => {
    assert.match(ACADEMY_TERMS.cohort.body, /group of teachers/i);
    assert.match(ACADEMY_TERMS.batch.body, /step inside a cohort/i);
    assert.match(ACADEMY_TERMS.course.body, /trainer can add a course/i);
    assert.match(ACADEMY_TERMS.course.body, /Only an admin adds cohorts and batches/i);
  });

  it("lets each cohort keep its own number of batches", () => {
    const summary = pathSummary([
      { id: "a", batches: [{ id: "a1", courses: [{ id: "c", completed: true }] }] },
      {
        id: "b",
        batches: [
          { id: "b1", courses: [{ id: "c", completed: false }] },
          { id: "b2", courses: [] },
          { id: "b3", courses: [{ id: "d", completed: true }] },
        ],
      },
    ], 2);
    assert.deepEqual(summary.batchesByCohort.map((row) => row.batchCount), [1, 3]);
    assert.equal(summary.batchesByCohort[0].complete, true);
    assert.equal(summary.batchesByCohort[1].complete, false);
    assert.equal(cohortIsComplete({ id: "empty", batches: [] }), false);
    assert.equal(batchIsComplete({ id: "empty", courses: [] }), false);
  });

  it("counts a teacher done only after the required cohorts", () => {
    const oneDone = pathSummary([
      { id: "a", batches: [{ id: "a1", courses: [{ id: "c", completed: true }] }] },
    ], 2);
    assert.equal(oneDone.done, false);
    assert.equal(oneDone.remaining, 1);
    assert.equal(normalizeCohortsRequired("4"), 4);
    assert.equal(normalizeCohortsRequired(0), 1);
    assert.equal(normalizeCohortsRequired(99), 50);
  });
});
