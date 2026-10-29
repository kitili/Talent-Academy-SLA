import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEADLINE_PASSED, fellowStillSees, isPastDue } from "../../../shared/academyPath.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");

function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

const now = new Date("2026-10-29T12:00:00Z");

describe("a deadline", () => {
  it("has passed at and after its moment, and never when there is none", () => {
    assert.equal(isPastDue("2026-10-29T12:00:00Z", now), true);
    assert.equal(isPastDue(new Date("2026-10-29T11:59:00Z"), now), true);
    assert.equal(isPastDue("2026-10-29T12:01:00Z", now), false);
    assert.equal(isPastDue(null, now), false);
    assert.equal(isPastDue("", now), false);
    assert.equal(isPastDue("not a date", now), false);
  });

  it("takes past-due work off a Fellow's lists unless they handed it in", () => {
    assert.equal(fellowStillSees("2026-10-28T00:00:00Z", false, now), false);
    assert.equal(fellowStillSees("2026-10-28T00:00:00Z", true, now), true);
    assert.equal(fellowStillSees("2026-10-30T00:00:00Z", false, now), true);
    assert.equal(fellowStillSees(null, false, now), true);
  });
});

describe("the Fellow routes keep to the deadline", () => {
  it("lists only work still open or already handed in", () => {
    assert.match(route(routes, "get", "/api/teacher/quizzes"), /fellowStillSees\(quiz\.dueDate, tried\.has\(quiz\.id\), now\)/);
    assert.match(route(routes, "get", "/api/teacher/assignments"), /fellowStillSees\(row\.due_date, Boolean\(row\.my_response\), now\)/);
  });

  it("refuses answers once the deadline passes (410)", () => {
    assert.match(route(routes, "post", "/api/assigned-quizzes/:quizId/submit"), /if \(isPastDue\(quiz\.dueDate\)\) return res\.status\(410\)\.json\(\{ error: DEADLINE_PASSED \}\)/);
    assert.match(route(routes, "post", "/api/teacher/assignments/:assignmentId/submit"), /if \(isPastDue\(assignment\?\.dueDate\)\) return res\.status\(410\)/);
  });

  it("opens a past-due exam only to review the Fellow's own tries", () => {
    const open = route(routes, "get", "/api/assigned-quizzes/:quizId");
    assert.match(open, /if \(isPastDue\(quiz\.dueDate\)\)/);
    assert.match(open, /if \(tries\.length === 0\) return res\.status\(410\)/);
  });

  it("says so in words", () => {
    assert.equal(DEADLINE_PASSED, "The deadline has passed");
  });
});

describe("times read by raw SQL", () => {
  it("are marked as the UTC they are stored in, so a browser in another zone reads the right moment", async () => {
    const { utcTimestamps } = await import("../../../server/storage.ts");
    const [row] = utcTimestamps([{ due_date: "2026-10-29 13:46:08.395", title: "x", end_date: null }], ["due_date", "end_date"]);
    assert.equal(row.due_date, "2026-10-29T13:46:08.395Z");
    assert.equal(row.end_date, null);
    const [kept] = utcTimestamps([{ due_date: "2026-10-29T13:46:08.395Z" }], ["due_date"]);
    assert.equal(kept.due_date, "2026-10-29T13:46:08.395Z");
  });
});
