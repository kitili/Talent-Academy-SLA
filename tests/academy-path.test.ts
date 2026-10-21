import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMY_TERMS,
  batchHoldingCourse,
  parseDeadline,
  deadlineLocalValue,
  batchIsComplete,
  cohortIsComplete,
  moveBatchOrder,
  nextBatchName,
  normalizeCohortsRequired,
  pathSummary,
} from "../shared/academyPath.ts";

describe("academy path", () => {
  it("names cohort, batch, and course as different things", () => {
    assert.match(ACADEMY_TERMS.cohort.body, /group of teachers/i);
    assert.match(ACADEMY_TERMS.batch.body, /step inside a cohort/i);
    assert.match(ACADEMY_TERMS.course.body, /admin adds a course/i);
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

  it("keeps batches in order from Batch One through Batch Five", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4].map(nextBatchName),
      ["Batch One", "Batch Two", "Batch Three", "Batch Four", "Batch Five"],
    );
    const ids = ["a", "b", "c", "d", "e"];
    assert.deepEqual(moveBatchOrder(ids, "c", "earlier"), ["a", "c", "b", "d", "e"]);
    assert.deepEqual(moveBatchOrder(ids, "a", "earlier"), ids);
    assert.deepEqual(moveBatchOrder(ids, "e", "later"), ids);
    assert.deepEqual(moveBatchOrder(ids, "missing", "later"), ids);
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

describe("one course per batch and optional deadlines", () => {
  it("keeps a course in one batch", () => {
    const batches = [
      { id: "b1", name: "Batch One", courses: [{ id: "c1" }] },
      { id: "b2", name: "Batch Two", courses: [{ id: "c2" }] },
    ];
    assert.equal(batchHoldingCourse(batches, "c2")?.id, "b2");
    assert.equal(batchHoldingCourse(batches, "c3"), undefined);
  });

  it("reads a deadline or none", () => {
    assert.equal(parseDeadline(""), null);
    assert.equal(parseDeadline("not a date"), null);
    assert.equal(parseDeadline(undefined), null);
    assert.equal(parseDeadline("2026-11-01T10:00:00.000Z")?.toISOString(), "2026-11-01T10:00:00.000Z");
    assert.equal(deadlineLocalValue(null), "");
    assert.match(deadlineLocalValue("2026-11-01T10:00:00.000Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
