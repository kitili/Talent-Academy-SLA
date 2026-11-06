import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { attendanceStatusRefused, deskMessageNotice, fileAddressRefused, staffCanAccessBatch } from "../../../server/routes.ts";
import { ObjectStorageService } from "../../../server/objectStorage.ts";
import { deskName } from "../../../shared/deskName.ts";

/**
 * The rules these routes apply run here for real, as exported functions. Route handlers call `storage` and `db`
 * directly, so the wiring of each rule into its route is a text contract. Importing `server/routes.ts` opens no
 * connection and loads no `.env`: nothing here runs a query.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");

/** The text of one route: from its `app.<verb>("path"` to the next `app.` call. */
function route(verb: string, path: string) {
  const start = routes.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = routes.indexOf("\n  app.", start + 10);
  return routes.slice(start, next === -1 ? undefined : next);
}

/** `first` is written before `then` in this route. */
function inOrder(text: string, first: string, then: string) {
  const a = text.indexOf(first);
  const b = text.indexOf(then);
  assert.notEqual(a, -1, `missing: ${first}`);
  assert.notEqual(b, -1, `missing: ${then}`);
  assert.ok(a < b, `${first} must come before ${then}`);
}

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("staffCanAccessBatch", () => {
  const admin = { id: "a", role: "admin" } as Express.User;
  const trainer = { id: "t", role: "trainer" } as Express.User;

  it("answers no for anyone when the cohort does not exist, an Admin too", () => {
    for (const missing of [undefined, null]) {
      assert.equal(staffCanAccessBatch(admin, missing), false);
      assert.equal(staffCanAccessBatch(trainer, missing), false);
      assert.equal(staffCanAccessBatch(undefined, missing), false);
    }
  });

  it("keeps the rule for a cohort that exists", () => {
    assert.equal(staffCanAccessBatch(admin, { trainerId: "other" }), true);
    assert.equal(staffCanAccessBatch(trainer, { trainerId: "t" }), true);
    assert.equal(staffCanAccessBatch(trainer, { trainerId: "other", trainerIds: ["t"] }), true);
    assert.equal(staffCanAccessBatch(trainer, { trainerId: "other", trainerIds: ["other"] }), false);
    assert.equal(staffCanAccessBatch(undefined, { trainerId: "t" }), false);
  });

  it("every route keyed on a cohort id answers 404 before it asks, so a missing cohort is not a 403", () => {
    for (const [verb, path] of [
      ["get", "/api/batches/:batchId/announcements"],
      ["get", "/api/batches/:batchId/assignments"],
      ["get", "/api/batches/:batchId/assignments/:assignmentId/submissions"],
      ["patch", "/api/batches/:batchId/assignments/:assignmentId/submissions/:teacherId"],
    ]) {
      inOrder(route(verb, path), "if (!batch) return res.status(404)", "staffCanAccessBatch(req.user, batch)");
    }
  });
});

describe("a stored file address must be a file we hold", () => {
  it("refuses a script address and any other site", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      `javascript:/api/local-objects/${UUID}`,
      `https://evil.example/api/local-objects/${UUID}`,
      `/api/local-objects/${UUID}/../../secret`,
      `//evil.example/objects/local/${UUID}`,
      "https://evil.example/paper.pdf",
      "https://store.public.blob.vercel-storage.com.evil.example/a.pdf",
      "http://store.public.blob.vercel-storage.com/a.pdf",
      { toString: () => "javascript:alert(1)" },
      42,
    ]) {
      assert.equal(fileAddressRefused(bad), true, String(bad));
    }
  });

  it("takes both shapes our own uploads produce, and no file at all", () => {
    for (const good of [`/api/local-objects/${UUID}`, `/objects/local/${UUID}`, "https://store.public.blob.vercel-storage.com/training/a.pdf"]) {
      assert.equal(fileAddressRefused(good), false, good);
    }
    for (const blank of [undefined, null, ""]) assert.equal(fileAddressRefused(blank), false);
  });

  describe("the address the Trainer's upload is really given", () => {
    const names = ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "PRIVATE_OBJECT_DIR"];
    const saved = new Map(names.map((name) => [name, process.env[name]]));
    before(() => names.forEach((name) => delete process.env[name]));
    after(() => saved.forEach((value, name) => (value === undefined ? delete process.env[name] : (process.env[name] = value))));

    it("passes in local storage and with Blob storage, as `POST /api/objects/upload` hands it out", async () => {
      const service = new ObjectStorageService();
      assert.equal(fileAddressRefused(await service.getObjectEntityUploadURL()), false);
      process.env.BLOB_READ_WRITE_TOKEN = "test-value-not-a-token";
      assert.equal(fileAddressRefused(await service.getObjectEntityUploadURL()), false);
      delete process.env.BLOB_READ_WRITE_TOKEN;
    });

    it("passes once a lesson upload has been normalised", () => {
      const service = new ObjectStorageService();
      assert.equal(fileAddressRefused(service.normalizeObjectEntityPath(`/api/local-objects/${UUID}`)), false);
    });
  });

  it("both routes refuse before they write, and after the cohort check", () => {
    const assignment = route("post", "/api/batches/:batchId/assignments");
    inOrder(assignment, "staffCanAccessBatch(req.user, batch)", "fileAddressRefused(fileUrl)");
    inOrder(assignment, "fileAddressRefused(fileUrl)", "storage.createWrittenAssignment(");
    assert.match(assignment, /fileAddressRefused\(fileUrl\)\) return res\.status\(400\)/);

    const paper = route("post", "/api/batches/:batchId/paper-exam");
    inOrder(paper, "staffCanAccessBatch(req.user, batch)", "fileAddressRefused(paperUrl)");
    inOrder(paper, "fileAddressRefused(paperUrl)", "saveWritingExam(");
    assert.match(paper, /fileAddressRefused\(paperUrl\)\) return res\.status\(400\)/);
  });

  it("the edit routes cannot set a file address: they name their fields", () => {
    const assignment = route("patch", "/api/batches/:batchId/assignments/:assignmentId");
    assert.doesNotMatch(assignment, /fileUrl/);
    assert.doesNotMatch(route("patch", "/api/assigned-quizzes/:quizId"), /paperUrl/);
  });
});

describe("attendance", () => {
  it("bulk marking takes only the marks the screen offers", () => {
    for (const status of ["present", "late", "absent", "excused"]) {
      assert.equal(attendanceStatusRefused([{ status }]), false, status);
    }
    for (const status of ["Present", "gone", "<b>x</b>", 1, {}, ["present"]]) {
      assert.equal(attendanceStatusRefused([{ status: "present" }, { status }]), true, String(status));
    }
  });

  it("a row with no mark is still skipped, not refused", () => {
    assert.equal(attendanceStatusRefused([{ status: "" }, {}, null, undefined]), false);
  });

  it("the route refuses the whole marking before it writes any of it", () => {
    const mark = route("post", "/api/batches/:batchId/attendance");
    inOrder(mark, "staffCanAccessBatch(req.user, batch)", "attendanceStatusRefused(records)");
    inOrder(mark, "attendanceStatusRefused(records)", "storage.upsertAttendanceRecord(");
  });

  it("the read routes answer 404 for a missing cohort, 403 for someone else's, and only then read", () => {
    for (const [path, read] of [
      ["/api/batches/:batchId/attendance", "storage.getAttendanceByBatch("],
      ["/api/batches/:batchId/attendance/summary", "storage.getBatchAttendanceSummary("],
    ]) {
      const text = route("get", path);
      inOrder(text, "if (!batch) return res.status(404)", "staffCanAccessBatch(req.user, batch)");
      inOrder(text, "staffCanAccessBatch(req.user, batch)", read);
    }
  });
});

describe("CSV exports hand names to a spreadsheet", () => {
  it("the gradebook guards its name, email and ID cells", () => {
    const gradebook = route("get", "/api/batches/:batchId/gradebook.csv");
    assert.match(gradebook, /csvCell\(String\(teacher\.name/);
    assert.match(gradebook, /csvCell\(String\(teacher\.email/);
    assert.match(gradebook, /csvCell\(String\(teacher\.teacherId/);
  });

  it("the cohort report guards its name and email cells", () => {
    const report = route("get", "/api/reports/batches/:batchId.csv");
    assert.match(report, /csvCell\(String\(teacher\.name/);
    assert.match(report, /csvCell\(String\(teacher\.email/);
  });

  it("no hand-written quoting is left in the routes file to go without the guard", () => {
    assert.doesNotMatch(routes, /\.replace\(\/"\/g, '""'\)/);
  });
});

describe("desk mail says who wrote it", () => {
  const post = route("post", "/api/desk-messages");

  it("the Fellow's row gives the name, not a word the session never carried", () => {
    assert.doesNotMatch(post, /teacherName/);
    assert.doesNotMatch(post, /"Teacher"/);
    assert.match(post, /storage\.getTeacher\(req\.teacherId\)/);
    assert.match(post, /const fromName = deskName\(sender\)/);
    inOrder(post, "if (!sender) return res.status(401)", "storage.createDeskMessage(");
  });

  it("`deskName` gives a Fellow's real name, and a person's name rather than a login", () => {
    assert.equal(deskName({ name: "Amina Wanjiru", email: "a@example.com" }), "Amina Wanjiru");
    assert.equal(deskName({ firstName: "Baraka", lastName: "Otieno", username: "trainer7" }), "Baraka Otieno");
    assert.equal(deskName({ username: "baraka.otieno" }), "Baraka Otieno");
  });

  it("the notice is titled with the sender and carries the start of the message", () => {
    const notice = deskMessageNotice("Amina Wanjiru", "x".repeat(400));
    assert.equal(notice.title, "Message from Amina Wanjiru");
    assert.equal(notice.message.length, 160);
    assert.match(post, /\.\.\.deskMessageNotice\(fromName, body\)/);
  });

  it("a Fellow's list of Trainers uses their names, not their logins", () => {
    const peers = route("get", "/api/teacher/desk-peers");
    assert.match(peers, /name: deskName\(trainer\)/);
    assert.doesNotMatch(peers, /trainer\.username/);
  });
});

describe("a Fellow's deadline reopening is unique at start-up", () => {
  const db = source("server/db.ts");

  it("creates the index after the guard that creates the table, so a new database does not fail", () => {
    inOrder(db, "await ensureSchemaColumns(", "CREATE UNIQUE INDEX IF NOT EXISTS idx_deadline_reopenings_unique");
    assert.match(db, /ON deadline_reopenings \(kind, item_id, teacher_id\)/);
  });

  it("is the index the schema declares", () => {
    assert.match(source("shared/schema.ts"), /uniqueIndex\("idx_deadline_reopenings_unique"\)\.on\(table\.kind, table\.itemId, table\.teacherId\)/);
  });
});
