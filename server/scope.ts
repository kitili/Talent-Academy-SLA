/**
 * Who may reach which cohort and course (C5). Every route that ties an id to the caller asks here,
 * so the rule has one home. Each resolver takes its row readers as an argument; the default readers
 * load `storage` and `db` lazily, so tests drive the rules with rows in memory and never touch the database.
 */

type Actor = { id?: string; role?: string | null } | null | undefined;

export type ScopeCohort = { id: string; status?: string | null };
export type StepRow = {
  id: string;
  orderIndex: number;
  createdAt?: Date | string | null;
  courses: Array<{ courseId: string; orderIndex: number }>;
};
export type PlacementRow = { courseId: string; assignedAt?: Date | string | null };

export type ScopeReaders = {
  /** Cohorts in a trainer's scope: `storage.getAllBatches(trainerId)`, the SQL twin of `trainerOwnsBatch` (C4). */
  trainerCohorts(trainerId: string): Promise<ScopeCohort[]>;
  /** Cohort ids with a `batch_courses` row for the course. */
  cohortIdsHoldingCourse(courseId: string): Promise<string[]>;
  /** Cohorts the teacher is enrolled in (`batch_teachers`). */
  teacherCohorts(teacherId: string): Promise<ScopeCohort[]>;
  /** The cohort's steps (`cohort_batches`) with the courses on each (`cohort_batch_courses`). */
  cohortSteps(cohortId: string): Promise<StepRow[]>;
  /** The courses placed on the cohort (`batch_courses`): what a teacher in it sees. */
  cohortPlacements(cohortId: string): Promise<PlacementRow[]>;
};

export const storageScopeReaders: ScopeReaders = {
  async trainerCohorts(trainerId) {
    const { storage } = await import("./storage");
    return storage.getAllBatches(trainerId);
  },
  async cohortIdsHoldingCourse(courseId) {
    const { db } = await import("./db");
    const { batchCourses } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select({ batchId: batchCourses.batchId }).from(batchCourses).where(eq(batchCourses.courseId, courseId));
    return rows.map((row) => row.batchId);
  },
  async teacherCohorts(teacherId) {
    const { storage } = await import("./storage");
    return storage.getBatchesForTeacher(teacherId);
  },
  async cohortSteps(cohortId) {
    const { db } = await import("./db");
    const { cohortBatches, cohortBatchCourses } = await import("@shared/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const steps = await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, cohortId));
    if (steps.length === 0) return [];
    const links = await db
      .select({
        cohortBatchId: cohortBatchCourses.cohortBatchId,
        courseId: cohortBatchCourses.courseId,
        orderIndex: cohortBatchCourses.orderIndex,
      })
      .from(cohortBatchCourses)
      .where(inArray(cohortBatchCourses.cohortBatchId, steps.map((step) => step.id)));
    return steps.map((step) => ({
      id: step.id,
      orderIndex: step.orderIndex,
      createdAt: step.createdAt,
      courses: links
        .filter((link) => link.cohortBatchId === step.id)
        .map((link) => ({ courseId: link.courseId, orderIndex: link.orderIndex })),
    }));
  },
  async cohortPlacements(cohortId) {
    const { storage } = await import("./storage");
    const placed = await storage.getCoursesForBatch(cohortId);
    return placed.map((course) => ({ courseId: course.id, assignedAt: course.assignedAt }));
  },
};

/** A cohort is open unless an admin closed it. */
export function cohortIsOpen(cohort: { status?: string | null }) {
  return (cohort.status || "open") !== "closed";
}

/** The ids of the cohorts a trainer runs (D8: a `cohort_trainers` row or `batches.trainer_id`). */
export async function trainerCohortIds(trainerId: string, readers: ScopeReaders = storageScopeReaders): Promise<string[]> {
  if (!trainerId) return [];
  const cohorts = await readers.trainerCohorts(trainerId);
  return cohorts.map((cohort) => cohort.id);
}

/**
 * Who may edit a course's modules, lesson files and quizzes (D2): an admin, or a trainer when the
 * course is placed on a cohort they run. Anyone else, and a course on no cohort in scope, is refused.
 */
export async function trainerMayEditCourse(
  user: Actor,
  courseId: string,
  readers: ScopeReaders = storageScopeReaders,
): Promise<boolean> {
  if (!user || !courseId) return false;
  if (user.role === "admin") return true;
  if (user.role !== "trainer" || !user.id) return false;
  const [mine, holding] = await Promise.all([
    trainerCohortIds(user.id, readers),
    readers.cohortIdsHoldingCourse(courseId),
  ]);
  const held = new Set(holding);
  return mine.some((cohortId) => held.has(cohortId));
}

/** The open cohorts a teacher is enrolled in that hold the course. Empty means the teacher may not take it. */
export async function teacherCohortsForCourse(
  teacherId: string,
  courseId: string,
  readers: ScopeReaders = storageScopeReaders,
): Promise<ScopeCohort[]> {
  if (!teacherId || !courseId) return [];
  const [enrolled, holding] = await Promise.all([
    readers.teacherCohorts(teacherId),
    readers.cohortIdsHoldingCourse(courseId),
  ]);
  const held = new Set(holding);
  return enrolled.filter((cohort) => held.has(cohort.id) && cohortIsOpen(cohort));
}

function timeOf(value?: Date | string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The order of a cohort's courses (D1), the pure part of `cohortCourseOrder`: steps by `orderIndex`,
 * then the courses inside each step by their `orderIndex`, then courses on no step by `assigned_at`.
 * Only courses placed on the cohort count; a step course with no placement is left out.
 */
export function orderCohortCourses(steps: StepRow[], placements: PlacementRow[]): string[] {
  const placed = new Set(placements.map((row) => row.courseId));
  const order: string[] = [];
  const sortedSteps = [...steps].sort((a, b) =>
    a.orderIndex - b.orderIndex || timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id));
  for (const step of sortedSteps) {
    const courses = [...step.courses].sort((a, b) => a.orderIndex - b.orderIndex || a.courseId.localeCompare(b.courseId));
    for (const course of courses) {
      if (placed.has(course.courseId) && !order.includes(course.courseId)) order.push(course.courseId);
    }
  }
  const unplaced = placements
    .filter((row) => !order.includes(row.courseId))
    .sort((a, b) => timeOf(a.assignedAt) - timeOf(b.assignedAt) || a.courseId.localeCompare(b.courseId));
  for (const row of unplaced) {
    if (!order.includes(row.courseId)) order.push(row.courseId);
  }
  return order;
}

/** The course ids of a cohort in the order a teacher takes them (D1). A course opens when the one before it is complete. */
export async function cohortCourseOrder(cohortId: string, readers: ScopeReaders = storageScopeReaders): Promise<string[]> {
  if (!cohortId) return [];
  const [steps, placements] = await Promise.all([readers.cohortSteps(cohortId), readers.cohortPlacements(cohortId)]);
  return orderCohortCourses(steps, placements);
}
