/**
 * The words every screen and guide uses (D1, D13): Cohort, then Step, then Course, then Module, then
 * Lesson file, and the learner is a Fellow. Tables, routes and code keep their old names:
 * `batches` is a cohort, `cohort_batches` is a step, `training_weeks` is a module, `deckFiles` are
 * lesson files, and `teachers` are Fellows.
 */

export const ACADEMY_TERMS = {
  cohort: {
    title: "Cohort",
    body: "A group of Fellows. It can have more than one trainer. A Fellow is done after the number of cohorts you set here. Cohorts do not have to look the same.",
  },
  step: {
    title: "Step",
    body: "One step inside a cohort. Each cohort has its own list, so one cohort can have two steps and another can have five. Steps set the order of the courses: a course opens when the course before it is complete.",
  },
  course: {
    title: "Course",
    body: "The lessons taught in a step. An admin adds a course on the Cohorts page, then places it on a step. Only an admin adds cohorts, steps and courses.",
  },
  module: {
    title: "Module",
    body: "One part of a course. Modules open in order: the next one opens when every lesson file in this one is done.",
  },
  lessonFile: {
    title: "Lesson file",
    body: "A file a Fellow reads inside a module. It is done when its approved quiz is passed, or, when it has no approved quiz, once the Fellow marks it read.",
  },
  learner: {
    title: "Fellow",
    body: "A learner in the academy. Fellows join cohorts, work through the courses in order and take the quizzes.",
  },
} as const;

export type PathCourse = { id: string; completed?: boolean };
export type PathBatch = { id: string; courses: PathCourse[] };
export type PathCohort = { id: string; batches: PathBatch[] };

export function normalizeCohortsRequired(value: unknown, fallback = 1) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return Math.max(1, fallback);
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

const BATCH_WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/**
 * The next step name, so a cohort reads Step One, Step Two, and onward (D1). Steps named before D1
 * keep their stored "Batch" names until an admin renames them.
 */
export function nextBatchName(existingCount: number) {
  const number = Math.max(0, Math.floor(existingCount)) + 1;
  const word = BATCH_WORDS[number - 1] || String(number);
  return `${ACADEMY_TERMS.step.title} ${word}`;
}

export function sortBatches<T extends { id: string; orderIndex: number }>(batches: T[]): T[] {
  return [...batches].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
}

/** Move one batch earlier or later. The returned ids are the new order. */
export function moveBatchOrder(ids: string[], id: string, direction: "earlier" | "later"): string[] {
  const index = ids.indexOf(id);
  if (index < 0) return ids.slice();
  const target = direction === "earlier" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return ids.slice();
  const next = ids.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function batchIsComplete(batch: PathBatch) {
  return batch.courses.length > 0 && batch.courses.every((course) => course.completed === true);
}

export function cohortIsComplete(cohort: PathCohort) {
  return cohort.batches.length > 0 && cohort.batches.every(batchIsComplete);
}

export function pathSummary(cohorts: PathCohort[], cohortsRequired: number) {
  const required = normalizeCohortsRequired(cohortsRequired);
  const completed = cohorts.filter(cohortIsComplete).length;
  return {
    cohortsRequired: required,
    cohortsCompleted: completed,
    cohortsEnrolled: cohorts.length,
    remaining: Math.max(0, required - completed),
    done: completed >= required,
    batchesByCohort: cohorts.map((cohort) => ({
      id: cohort.id,
      batchCount: cohort.batches.length,
      batchesComplete: cohort.batches.filter(batchIsComplete).length,
      complete: cohortIsComplete(cohort),
    })),
  };
}

/** A course sits in one batch of a cohort. This is the batch that already holds it, if any. */
export function batchHoldingCourse<T extends { id: string; courses: { id: string }[] }>(batches: T[], courseId: string): T | undefined {
  return batches.find((batch) => batch.courses.some((course) => course.id === courseId));
}

/** A deadline from a form field. Empty or unreadable text means no deadline. */
export function parseDeadline(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True once a deadline has passed. Work with no deadline is never past due. */
export function isPastDue(due: unknown, now: Date = new Date()) {
  const date = parseDeadline(due);
  return date !== null && date.getTime() <= now.getTime();
}

/**
 * The old rule, from when past-due work left a Fellow's lists. The server no longer uses it: since D2 (2026-11-06) the
 * item and its deadline stay visible and only the way to submit goes. `teacher-dashboard.tsx` still imports it until
 * task T2-F removes the import; delete it then.
 */
export function fellowStillSees(due: unknown, handedIn: boolean, now: Date = new Date()) {
  return handedIn || !isPastDue(due, now);
}

/** What a deadline can be reopened on: `quiz` is an assigned quiz or exam, `assignment` a written assignment or assessment. */
export type DeadlineKind = "quiz" | "assignment";

type DeadlineValue = string | Date | null | undefined;

/** A Fellow's own deadline: their `deadline_reopenings.due_date` when a row exists, otherwise the item's due date. */
export function effectiveDeadline(itemDue: DeadlineValue, reopenedDue?: DeadlineValue) {
  return reopenedDue ?? itemDue ?? null;
}

/** The deadline this Fellow works to, and whether it has passed for them. `closed` takes away the way to submit, not the item. */
export function fellowDeadline(itemDue: DeadlineValue, reopenedDue?: DeadlineValue, now: Date = new Date()) {
  const dueDate = effectiveDeadline(itemDue, reopenedDue);
  return { dueDate, closed: isPastDue(dueDate, now) };
}

/**
 * All a Fellow gets of a closed quiz or exam they never tried. Named fields only, so a question, paper or file added
 * to the table later cannot ride along. `id`, `batchId`, `kind` and `closed` let the screen place it; `kind` says the
 * sort of work and carries no link.
 */
export function closedQuizItem(
  quiz: { id: string; batchId: string; title?: string | null; description?: string | null },
  kind: string,
  dueDate: DeadlineValue,
) {
  return {
    id: quiz.id,
    batchId: quiz.batchId,
    kind,
    title: quiz.title ?? null,
    description: quiz.description ?? null,
    dueDate: dueDate ?? null,
    closed: true as const,
  };
}

/**
 * All a Fellow gets of a closed written assignment they never handed in. The row is raw SQL, so its columns are snake
 * case (`file_url`, `file_name`): named fields keep those out, where a list of `fileUrl`-style names to remove would not.
 */
export function closedAssignmentItem(
  row: { id: string; batch_id?: string | null; kind?: string | null; title?: string | null; instructions?: string | null },
  dueDate: DeadlineValue,
) {
  return {
    id: row.id,
    batch_id: row.batch_id ?? null,
    kind: row.kind ?? null,
    title: row.title ?? null,
    instructions: row.instructions ?? null,
    due_date: dueDate ?? null,
    dueDate: dueDate ?? null,
    closed: true as const,
  };
}

export const DEADLINE_PASSED = "The deadline has passed";

/** Local datetime-local value for an existing deadline so the trainer can change it. */
export function deadlineLocalValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
