import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { closedAssignmentItem, closedQuizItem, effectiveDeadline, fellowDeadline } from "../../../shared/academyPath.ts";
import {
  fellowAssignmentItem,
  fellowQuizItem,
  fellowSitsItem,
  listReopenings,
  quizForAttemptRead,
  reopenDeadline,
  type DeadlineDeps,
} from "../../../server/deadlineRoutes.ts";

/**
 * The rules are driven directly: the shared deadline rule, the Fellow's list rows, and the two reopen routes' logic
 * through `DeadlineDeps` with an in-memory fake. What the Express routes in `server/routes.ts` do with them cannot be
 * driven without a database, so that wiring is pinned as text contracts below and in `academy-desk/deadlines.test.ts`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const now = new Date("2026-11-06T12:00:00Z");
const past = new Date("2026-11-01T12:00:00Z");
const future = new Date("2026-11-20T12:00:00Z");
const later = "2026-12-01T12:00:00.000Z";

/** Every column of `assigned_quizzes` with a value, so a field that rides along shows. */
const storedQuiz = {
  id: "quiz-1",
  batchId: "cohort-1",
  weekId: "week-1",
  deckFileId: "deck-1",
  fileName: "lesson-secret.pdf",
  title: "Midterm",
  description: "Covers modules one and two",
  numQuestions: 2,
  passMark: 80,
  shuffleQuestions: "yes",
  questions: [
    { id: "q1", type: "multiple_choice", question: "The secret question?", options: ["a", "b"], correctAnswer: "a" },
    { id: "q2", type: "open_ended", question: "Another secret question?" },
  ],
  paperUrl: "https://blob.example/paper-secret.pdf",
  paperName: "paper-secret.pdf",
  status: "open",
  assignedBy: "trainer-1",
  assignedAt: past,
  dueDate: past as Date | null,
};

/** A row as `getWrittenAssignmentsForTeacher` returns it: raw SQL, so snake case and timestamps as text. */
const storedAssignment = {
  id: "work-1",
  batch_id: "cohort-1",
  title: "Lesson plan",
  instructions: "Write a lesson plan",
  due_date: "2026-11-01T12:00:00.000Z",
  created_by: "trainer-1",
  file_url: "https://blob.example/brief-secret.pdf",
  file_name: "brief-secret.pdf",
  kind: "assessment",
  created_at: "2026-10-01T12:00:00.000Z",
  my_response: null as string | null,
  trainer_score: null as number | null,
  trainer_comment: null as string | null,
};

const SECRET = /secret/i;

describe("a Fellow's effective deadline", () => {
  it("is their reopening when a row exists, otherwise the item's", () => {
    assert.equal(effectiveDeadline(past, future), future);
    assert.equal(effectiveDeadline(past, null), past);
    assert.equal(effectiveDeadline(past, undefined), past);
    assert.equal(effectiveDeadline(null, future), future);
    assert.equal(effectiveDeadline(null, null), null);
  });

  it("holds a Fellow to a row even when the row is earlier than the item", () => {
    assert.equal(effectiveDeadline(future, past), past);
  });

  it("is closed once the effective deadline passes, and never with no deadline", () => {
    assert.deepEqual(fellowDeadline(past, null, now), { dueDate: past, closed: true });
    assert.deepEqual(fellowDeadline(past, future, now), { dueDate: future, closed: false });
    assert.deepEqual(fellowDeadline(future, past, now), { dueDate: past, closed: true });
    assert.deepEqual(fellowDeadline(null, null, now), { dueDate: null, closed: false });
  });
});

describe("a closed quiz the Fellow never tried", () => {
  const row = fellowQuizItem(storedQuiz, null, false, now) as Record<string, unknown>;

  it("is still on the list, with its title, description and deadline", () => {
    assert.equal(row.title, "Midterm");
    assert.equal(row.description, "Covers modules one and two");
    assert.equal(row.dueDate, past);
    assert.equal(row.closed, true);
  });

  it("carries only named fields, and no question, paper or file", () => {
    assert.deepEqual(Object.keys(row).sort(), ["batchId", "closed", "description", "dueDate", "id", "kind", "title"]);
    assert.doesNotMatch(JSON.stringify(row), SECRET);
  });

  it("says what sort of work it is without a link to it", () => {
    assert.equal(row.kind, "paper");
    assert.equal((fellowQuizItem({ ...storedQuiz, paperUrl: null }, null, false, now) as Record<string, unknown>).kind, "quiz");
  });

  it("the projection takes nothing it does not name", () => {
    const extra = closedQuizItem({ ...storedQuiz, somethingNew: "secret" } as typeof storedQuiz, "quiz", past);
    assert.doesNotMatch(JSON.stringify(extra), SECRET);
  });
});

describe("a quiz the Fellow may still answer, or already tried", () => {
  it("open: arrives whole with the answers out and closed false", () => {
    const row = fellowQuizItem({ ...storedQuiz, dueDate: future }, null, false, now) as any;
    assert.equal(row.closed, false);
    assert.equal(row.paperUrl, storedQuiz.paperUrl);
    assert.equal(row.questions.length, 2);
    assert.doesNotMatch(JSON.stringify(row.questions), /correctAnswer/);
  });

  it("tried and closed: behaves as today, questions kept, answers out", () => {
    const row = fellowQuizItem(storedQuiz, null, true, now) as any;
    assert.equal(row.closed, true);
    assert.equal(row.paperUrl, storedQuiz.paperUrl);
    assert.equal(row.questions.length, 2);
    assert.doesNotMatch(JSON.stringify(row.questions), /correctAnswer/);
  });

  it("reopened: arrives whole with their own deadline", () => {
    const row = fellowQuizItem(storedQuiz, future, false, now) as any;
    assert.equal(row.closed, false);
    assert.equal(row.dueDate, future);
    assert.equal(row.questions.length, 2);
  });

  it("a reopening for one Fellow leaves the next Fellow's row closed", () => {
    const reopened: Record<string, Date> = {};
    const other = fellowQuizItem(storedQuiz, reopened[storedQuiz.id], false, now) as any;
    assert.equal(other.closed, true);
    assert.equal(other.questions, undefined);
  });
});

describe("a closed written assignment the Fellow never handed in", () => {
  const row = fellowAssignmentItem(storedAssignment, null, now) as Record<string, unknown>;

  it("is still on the list, with its title, instructions and deadline under both names", () => {
    assert.equal(row.title, "Lesson plan");
    assert.equal(row.instructions, "Write a lesson plan");
    assert.equal(row.due_date, storedAssignment.due_date);
    assert.equal(row.dueDate, storedAssignment.due_date);
    assert.equal(row.closed, true);
  });

  it("carries only named fields: no file, under either spelling", () => {
    assert.deepEqual(Object.keys(row).sort(), ["batch_id", "closed", "dueDate", "due_date", "id", "instructions", "kind", "title"]);
    assert.doesNotMatch(JSON.stringify(row), SECRET);
    for (const field of ["file_url", "file_name", "fileUrl", "fileName"]) assert.equal(field in row, false, field);
  });

  it("the projection takes nothing it does not name", () => {
    const extra = closedAssignmentItem({ ...storedAssignment, somethingNew: "secret" } as typeof storedAssignment, past);
    assert.doesNotMatch(JSON.stringify(extra), SECRET);
  });
});

describe("a written assignment still open, handed in or reopened", () => {
  it("open: keeps its file and every field the page reads", () => {
    const row = fellowAssignmentItem({ ...storedAssignment, due_date: future.toISOString() }, null, now) as any;
    assert.equal(row.closed, false);
    assert.equal(row.file_url, storedAssignment.file_url);
    assert.equal(row.dueDate, future.toISOString());
    assert.equal(row.due_date, future.toISOString());
  });

  it("handed in and closed: behaves as today, mark and file kept", () => {
    const row = fellowAssignmentItem({ ...storedAssignment, my_response: "My plan", trainer_score: 90 }, null, now) as any;
    assert.equal(row.closed, true);
    assert.equal(row.file_url, storedAssignment.file_url);
    assert.equal(row.my_response, "My plan");
    assert.equal(row.trainer_score, 90);
  });

  it("reopened: `due_date`, which today's page reads first, carries their own deadline too", () => {
    const row = fellowAssignmentItem(storedAssignment, future, now) as any;
    assert.equal(row.closed, false);
    assert.equal(row.due_date, future);
    assert.equal(row.dueDate, future);
    assert.equal(row.file_url, storedAssignment.file_url);
  });

  it("no deadline: open, with null under both names", () => {
    const row = fellowAssignmentItem({ ...storedAssignment, due_date: null as any }, null, now) as any;
    assert.equal(row.closed, false);
    assert.equal(row.dueDate, null);
  });
});

describe("the quiz in a Fellow's attempt read", () => {
  it("gives a Fellow it was not assigned to nothing", () => {
    assert.equal(quizForAttemptRead({ ...storedQuiz, dueDate: future }, { tried: false, sits: false, reopenedDue: null }, now), null);
  });
  it("gives an assigned Fellow past their deadline no question or paper", () => {
    const quiz = quizForAttemptRead(storedQuiz, { tried: false, sits: true, reopenedDue: null }, now) as any;
    assert.equal(quiz.closed, true);
    assert.deepEqual(quiz.questions, []);
    assert.doesNotMatch(JSON.stringify(quiz), SECRET);
  });
  it("keeps the quiz for a Fellow who tried it, and for one still inside their deadline", () => {
    const tried = quizForAttemptRead(storedQuiz, { tried: true, sits: false, reopenedDue: null }, now) as any;
    assert.equal(tried.paperUrl, storedQuiz.paperUrl);
    const reopened = quizForAttemptRead(storedQuiz, { tried: false, sits: true, reopenedDue: future }, now) as any;
    assert.equal(reopened.paperUrl, storedQuiz.paperUrl);
    assert.equal(reopened.dueDate, future);
  });
});

describe("who sits an item", () => {
  it("is everyone enrolled when the audience is empty", () => {
    assert.equal(fellowSitsItem(["f1", "f2"], [], "f1"), true);
    assert.equal(fellowSitsItem(["f1", "f2"], undefined, "f2"), true);
  });
  it("is only those named when it has an audience", () => {
    assert.equal(fellowSitsItem(["f1", "f2"], ["f2"], "f2"), true);
    assert.equal(fellowSitsItem(["f1", "f2"], ["f2"], "f1"), false);
  });
  it("is nobody outside the cohort, even when named", () => {
    assert.equal(fellowSitsItem(["f1"], [], "stranger"), false);
    assert.equal(fellowSitsItem(["f1"], ["stranger"], "stranger"), false);
  });
});

const admin = { id: "admin-1", role: "admin" };
const teachingTrainer = { id: "trainer-1", role: "trainer" };
const coTrainer = { id: "trainer-2", role: "trainer" };
const otherTrainer = { id: "trainer-9", role: "trainer" };

/** An in-memory stand-in for storage that records every write and notice. */
function fakeDeps(overrides: Partial<{ audience: string[]; enrolled: string[]; items: Record<string, any>; batches: Record<string, any> }> = {}) {
  const log = {
    setItemDue: [] as unknown[][],
    upserts: [] as any[],
    dropped: [] as unknown[][],
    notices: [] as Array<{ batchId: string; teacherIds: string[]; title: string; message: string }>,
  };
  const items = overrides.items ?? {
    "quiz:quiz-1": { id: "quiz-1", batchId: "cohort-1", title: "Midterm" },
    "assignment:work-1": { id: "work-1", batchId: "cohort-1", title: "Lesson plan" },
  };
  const batches = overrides.batches ?? { "cohort-1": { trainerId: "trainer-1", trainerIds: ["trainer-2"] } };
  const deps: DeadlineDeps = {
    loadItem: async (kind, itemId) => items[`${kind}:${itemId}`],
    loadBatch: async (batchId) => batches[batchId],
    enrolledIds: async () => overrides.enrolled ?? ["f1", "f2"],
    audience: async () => overrides.audience ?? [],
    setItemDue: async (...args) => { log.setItemDue.push(args); },
    dropSupersededReopenings: async (...args) => { log.dropped.push(args); },
    upsertReopening: async (row) => { log.upserts.push(row); },
    listReopenings: async () => [{ teacherId: "f1", dueDate: new Date(later) }],
    names: async () => ({ f1: "Asha" }),
    notify: async (batchId, teacherIds, title, message) => { log.notices.push({ batchId, teacherIds, title, message }); },
  };
  return { deps, log };
}

const fellowBody = { kind: "quiz", itemId: "quiz-1", scope: "fellow", teacherId: "f1", dueDate: later };
const everyoneBody = { kind: "quiz", itemId: "quiz-1", scope: "everyone", dueDate: later };

function assertWroteNothing(log: ReturnType<typeof fakeDeps>["log"]) {
  assert.deepEqual(log, { setItemDue: [], upserts: [], dropped: [], notices: [] });
}

describe("POST /api/deadlines/reopen for one Fellow", () => {
  it("writes that Fellow's row, leaves the item alone and tells only them", async () => {
    const { deps, log } = fakeDeps();
    const answer = await reopenDeadline(admin, fellowBody, deps, now);
    assert.equal(answer.status, 200);
    assert.deepEqual(log.upserts, [{ kind: "quiz", itemId: "quiz-1", teacherId: "f1", dueDate: new Date(later), createdBy: "admin-1" }]);
    assert.deepEqual(log.setItemDue, []);
    assert.deepEqual(log.dropped, []);
    assert.equal(log.notices.length, 1);
    assert.deepEqual(log.notices[0].teacherIds, ["f1"]);
    assert.equal(log.notices[0].title, "Deadline updated");
    assert.match(log.notices[0].message, /^Midterm is now due /);
  });

  it("works on written assignments too", async () => {
    const { deps, log } = fakeDeps();
    const answer = await reopenDeadline(admin, { ...fellowBody, kind: "assignment", itemId: "work-1" }, deps, now);
    assert.equal(answer.status, 200);
    assert.equal(log.upserts[0].kind, "assignment");
    assert.equal(log.upserts[0].itemId, "work-1");
  });

  it("refuses a Fellow outside the named audience, and writes nothing", async () => {
    const { deps, log } = fakeDeps({ audience: ["f2"] });
    const answer = await reopenDeadline(admin, fellowBody, deps, now);
    assert.equal(answer.status, 400);
    assertWroteNothing(log);
  });

  it("refuses a Fellow who is not in the cohort, even with an empty audience", async () => {
    const { deps, log } = fakeDeps({ enrolled: ["f2"] });
    const answer = await reopenDeadline(admin, fellowBody, deps, now);
    assert.equal(answer.status, 400);
    assertWroteNothing(log);
  });

  it("refuses when no Fellow is named: an empty notice list would tell the whole cohort", async () => {
    const { deps, log } = fakeDeps();
    const { teacherId: _dropped, ...body } = fellowBody;
    const answer = await reopenDeadline(admin, body, deps, now);
    assert.equal(answer.status, 400);
    assertWroteNothing(log);
  });
});

describe("POST /api/deadlines/reopen for everyone", () => {
  it("moves the item's own date, writes no row, and drops only the rows it supersedes", async () => {
    const { deps, log } = fakeDeps();
    const answer = await reopenDeadline(admin, everyoneBody, deps, now);
    assert.equal(answer.status, 200);
    assert.deepEqual(log.setItemDue, [["quiz", "quiz-1", new Date(later)]]);
    assert.deepEqual(log.upserts, []);
    assert.deepEqual(log.dropped, [["quiz", "quiz-1", new Date(later)]]);
  });

  it("tells the audience, or the cohort through an empty list, the way the edit routes do", async () => {
    const named = fakeDeps({ audience: ["f2"] });
    await reopenDeadline(admin, everyoneBody, named.deps, now);
    assert.deepEqual(named.log.notices[0].teacherIds, ["f2"]);
    const cohort = fakeDeps();
    await reopenDeadline(admin, everyoneBody, cohort.deps, now);
    assert.deepEqual(cohort.log.notices[0].teacherIds, []);
    assert.equal(cohort.log.notices[0].batchId, "cohort-1");
  });
});

describe("the new deadline", () => {
  for (const [label, dueDate] of [
    ["in the past", past.toISOString()],
    ["exactly now", now.toISOString()],
    ["empty", ""],
    ["missing", undefined],
    ["unreadable", "not a date"],
  ] as const) {
    for (const body of [fellowBody, everyoneBody]) {
      it(`is refused when ${label} (${body.scope}), and nothing is written`, async () => {
        const { deps, log } = fakeDeps();
        const answer = await reopenDeadline(admin, { ...body, dueDate }, deps, now);
        assert.equal(answer.status, 400);
        assertWroteNothing(log);
      });
    }
  }
});

describe("the shape of a reopen request", () => {
  for (const [label, change] of [
    ["an unknown kind", { kind: "goal" }],
    ["an unknown scope", { scope: "cohort" }],
    ["no item", { itemId: undefined }],
    ["an item id that is not text", { itemId: { $ne: "" } }],
  ] as const) {
    it(`refuses ${label}`, async () => {
      const { deps, log } = fakeDeps();
      assert.equal((await reopenDeadline(admin, { ...fellowBody, ...change }, deps, now)).status, 400);
      assertWroteNothing(log);
    });
  }
  it("refuses an empty body", async () => {
    const { deps, log } = fakeDeps();
    assert.equal((await reopenDeadline(admin, undefined, deps, now)).status, 400);
    assertWroteNothing(log);
  });
});

describe("who may reopen and read", () => {
  for (const body of [fellowBody, everyoneBody]) {
    it(`an Admin on any item (${body.scope})`, async () => {
      const { deps } = fakeDeps({ batches: { "cohort-1": { trainerId: "someone-else", trainerIds: [] } } });
      assert.equal((await reopenDeadline(admin, body, deps, now)).status, 200);
    });
    it(`a Trainer who teaches the cohort, as its trainer or through cohort_trainers (${body.scope})`, async () => {
      assert.equal((await reopenDeadline(teachingTrainer, body, fakeDeps().deps, now)).status, 200);
      assert.equal((await reopenDeadline(coTrainer, body, fakeDeps().deps, now)).status, 200);
    });
    it(`not a Trainer of another cohort, and nothing is written (${body.scope})`, async () => {
      const { deps, log } = fakeDeps();
      assert.equal((await reopenDeadline(otherTrainer, body, deps, now)).status, 403);
      assertWroteNothing(log);
    });
    it(`not a Trainer when the cohort cannot be found: never read as "any staff" (${body.scope})`, async () => {
      const { deps, log } = fakeDeps({ batches: {} });
      assert.equal((await reopenDeadline(otherTrainer, body, deps, now)).status, 404);
      assertWroteNothing(log);
    });
    it(`not someone who is neither (${body.scope})`, async () => {
      const { deps, log } = fakeDeps();
      assert.equal((await reopenDeadline({ id: "x", role: "teacher" }, body, deps, now)).status, 403);
      assert.equal((await reopenDeadline(undefined, body, deps, now)).status, 403);
      assertWroteNothing(log);
    });
  }

  it("a Trainer of another cohort learns nothing about who sits the work", async () => {
    const { deps } = fakeDeps({ audience: ["f2"] });
    const answer = await reopenDeadline(otherTrainer, fellowBody, deps, now);
    assert.equal(answer.status, 403);
  });

  it("a missing item is a 404", async () => {
    const { deps, log } = fakeDeps({ items: {} });
    assert.equal((await reopenDeadline(admin, fellowBody, deps, now)).status, 404);
    assertWroteNothing(log);
  });
});

describe("GET /api/deadlines/reopenings", () => {
  const query = { kind: "quiz", itemId: "quiz-1" };

  it("answers with teacherId, name and dueDate", async () => {
    const answer = await listReopenings(admin, query, fakeDeps().deps);
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, [{ teacherId: "f1", name: "Asha", dueDate: new Date(later) }]);
  });
  it("has the same access as reopening", async () => {
    assert.equal((await listReopenings(teachingTrainer, query, fakeDeps().deps)).status, 200);
    assert.equal((await listReopenings(otherTrainer, query, fakeDeps().deps)).status, 403);
    assert.equal((await listReopenings(otherTrainer, query, fakeDeps({ batches: {} }).deps)).status, 404);
  });
  it("refuses an unknown kind or a missing item", async () => {
    assert.equal((await listReopenings(admin, { kind: "goal", itemId: "quiz-1" }, fakeDeps().deps)).status, 400);
    assert.equal((await listReopenings(admin, { kind: "quiz" }, fakeDeps().deps)).status, 400);
  });
});

describe("the wiring, as text contracts", () => {
  const deadlineRoutes = source("server/deadlineRoutes.ts");
  const storage = source("server/storage.ts");
  const routes = source("server/routes.ts");

  it("both routes are Trainer or Admin routes behind a staff sign-in", () => {
    assert.match(deadlineRoutes, /app\.post\("\/api\/deadlines\/reopen", guards\.isAuthenticated, guards\.isTrainer,/);
    assert.match(deadlineRoutes, /app\.get\("\/api\/deadlines\/reopenings", guards\.isAuthenticated, guards\.isTrainer,/);
    assert.match(routes, /registerDeadlineRoutes\(app, guards\);/);
  });

  it("everyone moves the date through the storage calls the deadline edit routes use", () => {
    assert.match(deadlineRoutes, /storage\.updateAssignedQuiz\(itemId, \{ dueDate: due \}\)/);
    assert.match(deadlineRoutes, /storage\.updateWrittenAssignment\(itemId, \{ dueDate: due \}\)/);
    assert.match(routes, /storage\.updateAssignedQuiz\(req\.params\.quizId, \{/);
    assert.match(routes, /storage\.updateWrittenAssignment\(assignment\.id, updates\)/);
  });

  it("the notice is the edit routes' own, and the audience comes from each kind's own table", () => {
    assert.match(deadlineRoutes, /notifyQuizTeachers\(batchId, teacherIds, title, message\)/);
    assert.match(deadlineRoutes, /storage\.getQuizAudienceMap\(\[itemId\]\)/);
    assert.match(deadlineRoutes, /storage\.getWrittenAssignmentAudienceMap\(\[itemId\]\)/);
  });

  it("scope comes from trainerOwnsBatch, never from the wrapper that lets any staff through on an undefined cohort", () => {
    assert.match(deadlineRoutes, /if \(!trainerOwnsBatch\(actor, batch\)\) return refused\(403/);
    assert.doesNotMatch(deadlineRoutes, /staffCanAccessBatch\(/);
  });

  it("the upsert needs no unique index, because schemaGuard creates the table without one", () => {
    const start = storage.indexOf("async upsertDeadlineReopening(");
    const body = storage.slice(start, storage.indexOf("async dropSupersededReopenings(", start));
    assert.ok(start > 0);
    assert.doesNotMatch(body, /onConflict/);
    assert.match(source("server/schemaGuard.ts"), /CREATE TABLE IF NOT EXISTS/);
    assert.doesNotMatch(source("server/schemaGuard.ts"), /UNIQUE INDEX/);
  });

  it("moving an item's own date drops the reopenings it supersedes on every edit path", () => {
    assert.match(routes, /if \(hasDueDate\) await storage\.dropSupersededReopenings\("quiz", quiz\.id, parseDeadline\(req\.body\.dueDate\)\);/);
    assert.match(routes, /await storage\.dropSupersededReopenings\("assignment", assignment\.id, due\);/);
  });

  it("the overdue counts for staff use each Fellow's effective deadline", () => {
    const counted = storage.match(/SELECT MAX\(r\.due_date\) FROM deadline_reopenings r WHERE r\.kind = 'assignment' AND r\.item_id = wa\.id AND r\.teacher_id = bt\.teacher_id/g) ?? [];
    assert.equal(counted.length, 2);
    assert.doesNotMatch(storage, /AND wa\.due_date < NOW\(\)/);
  });
});
