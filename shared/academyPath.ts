/**
 * Cohort, batch, and course are three different things.
 * A cohort is the group. A batch is a step inside that group.
 * A course is the lessons on a batch.
 */

export const ACADEMY_TERMS = {
  cohort: {
    title: "Cohort",
    body: "A group of teachers. It can have more than one trainer. A teacher is done after the number of cohorts you set here. Cohorts do not have to look the same.",
  },
  batch: {
    title: "Batch",
    body: "One step inside a cohort. Each cohort has its own list, so one cohort can have two batches and another can have five. A batch can hold more than one teacher.",
  },
  course: {
    title: "Course",
    body: "The lessons taught in a batch. An admin or a trainer can add a course. Only an admin adds cohorts and batches.",
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

/** The next step name, so a cohort reads Batch One, Batch Two, and onward. */
export function nextBatchName(existingCount: number) {
  const number = Math.max(0, Math.floor(existingCount)) + 1;
  const word = BATCH_WORDS[number - 1] || String(number);
  return `Batch ${word}`;
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
