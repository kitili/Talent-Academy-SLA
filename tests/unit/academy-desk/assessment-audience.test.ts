import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { assignmentRoster, audienceLabel, audienceWithNames } from "../../../shared/academyPeople.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");
const storage = source("server/storage.ts");

/** The text of one route: from its `app.<verb>("path"` to the next `app.` call. */
function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("who an assessment is given to", () => {
  it("names each Fellow in the order saved, and keeps an id whose Fellow is gone", () => {
    const audience = audienceWithNames(["b", "a", "gone"], { a: "Amina", b: "Baraka" });
    assert.deepEqual(audience, [
      { teacherId: "b", name: "Baraka" },
      { teacherId: "a", name: "Amina" },
      { teacherId: "gone", name: "Fellow no longer on file" },
    ]);
    assert.equal(audienceLabel(audience.slice(0, 2)), "Baraka, Amina");
  });

  it("says whole cohort when nobody is named", () => {
    assert.equal(audienceLabel([]), "Whole cohort");
    assert.equal(audienceLabel(undefined), "Whole cohort");
  });

  it("lists submitted work first, then those still to submit by name, and keeps a submitter who left", () => {
    const rows = assignmentRoster(
      [{ id: "z", name: "Zawadi" }, { id: "a", name: "Amina" }, { id: "b", name: "Baraka" }],
      [
        { id: "s1", teacher_id: "b", teacher_name: "Baraka", response: "mine" },
        { id: "s2", teacher_id: "left", teacher_name: "Left", response: "theirs" },
      ],
    );
    assert.deepEqual(rows.map((row) => [row.teacher_id, row.submitted]), [
      ["b", true],
      ["left", true],
      ["a", false],
      ["z", false],
    ]);
    assert.equal(rows[2].response, null);
  });

  it("is sent with the names on the Trainer's quiz, exam and assessment lists", () => {
    assert.match(route(routes, "get", "/api/batches/:batchId/quizzes"), /audience: audienceWithNames/);
    assert.match(storage, /audience: audienceWithNames\(audience\[row\.id\] \|\| \[\], names\)/);
  });
});

describe("marking stays inside the cohort", () => {
  for (const [verb, path] of [
    ["get", "/api/batches/:batchId/assignments/:assignmentId/submissions"],
    ["patch", "/api/batches/:batchId/assignments/:assignmentId/submissions/:teacherId"],
  ]) {
    it(`${verb.toUpperCase()} ${path} refuses an assessment from another cohort`, () => {
      assert.match(route(routes, verb, path), /if \(!batch \|\| !assignment \|\| assignment\.batchId !== batch\.id\) return res\.status\(404\)/);
    });
  }

  it("lists every Fellow who sits the work, not only those who submitted", () => {
    assert.match(route(routes, "get", "/api/batches/:batchId/assignments/:assignmentId/submissions"), /getAssignmentRoster\(assignment\)/);
  });

  it("tells only the named Fellows when a deadline moves", () => {
    const patch = route(routes, "patch", "/api/batches/:batchId/assignments/:assignmentId");
    assert.match(patch, /notifyQuizTeachers\(\s*batch\.id,\s*audience,/);
    assert.doesNotMatch(patch, /notifyBatchTeachers/);
  });
});
