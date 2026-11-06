import type { Express } from "express";
import { closedAssignmentItem, closedQuizItem, fellowDeadline, isPastDue, parseDeadline, type DeadlineKind } from "@shared/academyPath";
import { isWritingExam, quizVisibleToTeacher } from "@shared/trainerDesk";
import { trainerOwnsBatch } from "./access";
import { learnerQuiz } from "./learnerQuiz";
import type { RouteGuards } from "./routeGuards";
import { storage } from "./storage";

/** Reopening a quiz, exam or assessment for one Fellow or everyone. Contract: plans/sla-feedback-fixes/sla-feedback-fixes-plan.md. */

type Due = string | Date | null | undefined;
type Actor = { id?: string; role?: string | null } | null | undefined;
type StoredQuizQuestion = Parameters<typeof learnerQuiz>[0]["questions"];
type FellowQuiz = {
  id: string;
  batchId: string;
  title?: string | null;
  description?: string | null;
  dueDate?: Due;
  paperUrl?: string | null;
  questions?: StoredQuizQuestion;
};

function quizKind(quiz: FellowQuiz) {
  return quiz.paperUrl ? "paper" : isWritingExam(quiz) ? "written" : "quiz";
}

/** One row of `GET /api/teacher/quizzes`. A closed quiz they never tried is cut down to `closedQuizItem`; the rest is as ever, answers out. */
export function fellowQuizItem<T extends FellowQuiz>(quiz: T, reopenedDue: Due, tried: boolean, now: Date = new Date()) {
  const { dueDate, closed } = fellowDeadline(quiz.dueDate, reopenedDue, now);
  if (closed && !tried) return closedQuizItem(quiz, quizKind(quiz), dueDate);
  return { ...learnerQuiz(quiz), kind: quizKind(quiz), dueDate, closed };
}

/**
 * One row of `GET /api/teacher/assignments`. `due_date` is what the Fellow's page reads today, so it carries the
 * effective deadline too, or a reopened Fellow's page would still treat the work as past due.
 */
export function fellowAssignmentItem<T extends {
  id: string;
  due_date?: Due;
  my_response?: unknown;
}>(row: T, reopenedDue: Due, now: Date = new Date()) {
  const { dueDate, closed } = fellowDeadline(row.due_date, reopenedDue, now);
  if (closed && !row.my_response) return closedAssignmentItem(row, dueDate);
  return { ...row, due_date: dueDate, dueDate, closed };
}

/**
 * The quiz in `GET /api/assigned-quizzes/:quizId/attempts`. Trying it is what earns the quiz here. Without a try, a
 * Fellow it was not assigned to gets nothing, and an assigned Fellow past their deadline gets `closedQuizItem`.
 */
export function quizForAttemptRead<T extends FellowQuiz>(
  quiz: T,
  fellow: { tried: boolean; sits: boolean; reopenedDue: Due },
  now: Date = new Date(),
) {
  const { dueDate, closed } = fellowDeadline(quiz.dueDate, fellow.reopenedDue, now);
  if (!fellow.tried && !fellow.sits) return null;
  // `questions` is empty and named only because `attemptQuizView` takes something that has them.
  if (!fellow.tried && closed) return { ...closedQuizItem(quiz, quizKind(quiz), dueDate), questions: [] };
  return { ...quiz, dueDate, closed };
}

/** Whether a Fellow sits an item: enrolled in its cohort, and named in its audience when it has one (empty means the whole cohort). */
export function fellowSitsItem(enrolledIds: string[], audience: string[] | undefined, teacherId: string) {
  return enrolledIds.includes(teacherId) && quizVisibleToTeacher(audience, teacherId);
}

export type DeadlineItem = { id: string; batchId: string; title?: string | null };

/** What the two routes need from the outside world, so their rules can be driven without a database. */
export type DeadlineDeps = {
  loadItem(kind: DeadlineKind, itemId: string): Promise<DeadlineItem | undefined>;
  loadBatch(batchId: string): Promise<{ trainerId?: string | null; trainerIds?: string[] | null } | undefined>;
  enrolledIds(batchId: string): Promise<string[]>;
  audience(kind: DeadlineKind, itemId: string): Promise<string[]>;
  setItemDue(kind: DeadlineKind, itemId: string, due: Date): Promise<unknown>;
  dropSupersededReopenings(kind: DeadlineKind, itemId: string, due: Date): Promise<unknown>;
  upsertReopening(row: { kind: DeadlineKind; itemId: string; teacherId: string; dueDate: Date; createdBy: string | null }): Promise<unknown>;
  listReopenings(kind: DeadlineKind, itemId: string): Promise<Array<{ teacherId: string; dueDate: Date }>>;
  names(teacherIds: string[]): Promise<Record<string, string>>;
  notify(batchId: string, teacherIds: string[], title: string, message: string): Promise<unknown>;
};

const storageDeadlineDeps: DeadlineDeps = {
  loadItem: (kind, itemId) => (kind === "quiz" ? storage.getAssignedQuiz(itemId) : storage.getWrittenAssignment(itemId)),
  loadBatch: (batchId) => storage.getBatch(batchId),
  enrolledIds: async (batchId) => (await storage.getTeachersInBatch(batchId)).map((teacher) => teacher.id),
  audience: async (kind, itemId) => (kind === "quiz"
    ? await storage.getQuizAudienceMap([itemId])
    : await storage.getWrittenAssignmentAudienceMap([itemId]))[itemId] || [],
  setItemDue: (kind, itemId, due) => (kind === "quiz"
    ? storage.updateAssignedQuiz(itemId, { dueDate: due })
    : storage.updateWrittenAssignment(itemId, { dueDate: due })),
  dropSupersededReopenings: (kind, itemId, due) => storage.dropSupersededReopenings(kind, itemId, due),
  upsertReopening: (row) => storage.upsertDeadlineReopening(row),
  listReopenings: (kind, itemId) => storage.listDeadlineReopenings(kind, itemId),
  names: (teacherIds) => storage.getTeacherNameMap(teacherIds),
  // `routes.ts` registers this module, so its notice is read when one is sent, not while the two files load.
  notify: async (batchId, teacherIds, title, message) => (await import("./routes")).notifyQuizTeachers(batchId, teacherIds, title, message),
};

type RouteAnswer = { status: number; body: unknown };

const refused = (status: number, error: string): RouteAnswer => ({ status, body: { error } });

function readKind(value: unknown): DeadlineKind | null {
  return value === "quiz" || value === "assignment" ? value : null;
}

function readId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The item, when this person may act on it: an Admin on any item, a Trainer only in a cohort they teach. Calls
 * `trainerOwnsBatch`, the rule under the deadline edit routes' `staffCanAccessBatch`, and not that wrapper: it answers
 * yes for any staff when the cohort is `undefined`, so here a cohort that cannot be found is a 404.
 */
async function itemInScope(actor: Actor, kind: DeadlineKind, itemId: string, deps: DeadlineDeps): Promise<DeadlineItem | RouteAnswer> {
  const item = await deps.loadItem(kind, itemId);
  if (!item) return refused(404, "That work was not found");
  const batch = await deps.loadBatch(item.batchId);
  if (!batch) return refused(404, "That work was not found");
  if (!trainerOwnsBatch(actor, batch)) return refused(403, "Access denied");
  return item;
}

const isRefusal = (value: DeadlineItem | RouteAnswer): value is RouteAnswer => "status" in value;

/** `POST /api/deadlines/reopen`. */
export async function reopenDeadline(actor: Actor, body: unknown, deps: DeadlineDeps = storageDeadlineDeps, now: Date = new Date()): Promise<RouteAnswer> {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kind = readKind(input.kind);
  const itemId = readId(input.itemId);
  const scope = input.scope === "fellow" || input.scope === "everyone" ? input.scope : null;
  if (!kind || !itemId || !scope) return refused(400, "Send kind (quiz or assignment), itemId and scope (fellow or everyone)");
  const due = parseDeadline(input.dueDate);
  if (!due) return refused(400, "Choose the new deadline");
  if (isPastDue(due, now)) return refused(400, "The new deadline must be in the future");
  const teacherId = scope === "fellow" ? readId(input.teacherId) : "";

  const item = await itemInScope(actor, kind, itemId, deps);
  if (isRefusal(item)) return item;
  const audience = await deps.audience(kind, itemId);

  if (scope === "fellow") {
    if (!fellowSitsItem(await deps.enrolledIds(item.batchId), audience, teacherId)) {
      return refused(400, "That Fellow does not sit this work");
    }
    await deps.upsertReopening({ kind, itemId, teacherId, dueDate: due, createdBy: actor?.id ?? null });
  } else {
    await deps.setItemDue(kind, itemId, due);
    await deps.dropSupersededReopenings(kind, itemId, due);
  }

  // The notice the deadline edit routes send. An empty list tells the whole cohort; `fellow` got past the check above, so it names someone.
  deps.notify(
    item.batchId,
    scope === "fellow" ? [teacherId] : audience,
    "Deadline updated",
    `${item.title} is now due ${due.toLocaleString()}.`,
  ).catch((error) => console.error("Reopen notice failed:", error));

  return {
    status: 200,
    body: { kind, itemId, scope, ...(scope === "fellow" ? { teacherId } : {}), dueDate: due },
  };
}

/** `GET /api/deadlines/reopenings`: who has their own deadline on this item. */
export async function listReopenings(actor: Actor, query: { kind?: unknown; itemId?: unknown }, deps: DeadlineDeps = storageDeadlineDeps): Promise<RouteAnswer> {
  const kind = readKind(query.kind);
  const itemId = readId(query.itemId);
  if (!kind || !itemId) return refused(400, "Send kind (quiz or assignment) and itemId");
  const item = await itemInScope(actor, kind, itemId, deps);
  if (isRefusal(item)) return item;
  const rows = await deps.listReopenings(kind, itemId);
  const names = await deps.names(rows.map((row) => row.teacherId));
  return {
    status: 200,
    body: rows.map((row) => ({ teacherId: row.teacherId, name: names[row.teacherId] || "Fellow", dueDate: row.dueDate })),
  };
}

export function registerDeadlineRoutes(app: Express, guards: RouteGuards) {
  app.post("/api/deadlines/reopen", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const answer = await reopenDeadline(req.user, req.body);
      res.status(answer.status).json(answer.body);
    } catch (error) {
      console.error("Error reopening a deadline:", error);
      res.status(500).json({ error: "Failed to reopen the deadline" });
    }
  });

  app.get("/api/deadlines/reopenings", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const answer = await listReopenings(req.user, req.query);
      res.status(answer.status).json(answer.body);
    } catch (error) {
      console.error("Error listing reopened deadlines:", error);
      res.status(500).json({ error: "Failed to list reopened deadlines" });
    }
  });
}
