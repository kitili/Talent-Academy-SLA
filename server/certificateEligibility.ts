/**
 * Who may receive which certificate (D4). Certificates stay manual: an admin issues them, and the server refuses
 * - a course certificate unless C3 (`computeCourseCompletion`) says the course is complete;
 * - a Fellowship or Advanced (graduation) certificate unless the academy path is done (`pathSummary(...).done`).
 * Both are recomputed from progress rows. The stored course completion row is never read, because the course skip
 * (finding 1) may have marked it complete. The readers are an argument, so tests drive the rules with rows in memory.
 */
import { pathSummary, type PathCohort } from "@shared/academyPath";
import { PATH_INCOMPLETE_REFUSAL } from "@shared/certificateDesigns";
import { refusal } from "@shared/constants";
import {
  computeCourseCompletion,
  storageCompletionReaders,
  type CompletionModule,
  type CompletionProgressRow,
  type CompletionReaders,
  type CourseCompletion,
} from "./completion";
import { trainerOwnsBatch } from "./access";
import { storageScopeReaders, type ScopeCohort, type ScopeReaders, type StepRow } from "./scope";

type CohortOwner = { trainerId?: string | null; trainerIds?: string[] | null };

/**
 * Whether the caller may read or change a cohort's certificate rows (C4, N6): an admin reaches every cohort, a
 * trainer only the cohorts they run. A missing cohort is its own answer, so the route sends 404 and never treats
 * "no cohort" as "any staff may" (`staffCanAccessBatch(user, undefined)` would).
 */
export async function certificateCohortAccess(
  user: Parameters<typeof trainerOwnsBatch>[0],
  batchId: string,
  getBatch: (id: string) => Promise<CohortOwner | undefined> = async (id) => (await import("./storage")).storage.getBatch(id),
): Promise<"allowed" | "missing" | "denied"> {
  const batch = await getBatch(batchId);
  if (!batch) return "missing";
  return trainerOwnsBatch(user, batch) ? "allowed" : "denied";
}

export type EligibilityReaders = CompletionReaders & Pick<ScopeReaders, "teacherCohorts" | "cohortSteps"> & {
  /** `academy_settings.cohorts_required` for the path, or null when no admin has saved it. */
  cohortsRequired(): Promise<number | null>;
};

/** The one `academy_settings` row; `server/academyPathRoutes.ts` writes it and reads it for the learner path. */
const PATH_SETTINGS_ID = "path";

export const storageEligibilityReaders: EligibilityReaders = {
  ...storageCompletionReaders,
  teacherCohorts: storageScopeReaders.teacherCohorts,
  cohortSteps: storageScopeReaders.cohortSteps,
  async cohortsRequired() {
    const { db } = await import("./db");
    const { academySettings } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(academySettings).where(eq(academySettings.id, PATH_SETTINGS_ID));
    return row?.cohortsRequired ?? null;
  },
};

/** C3 once per course: a course on several steps or cohorts is still one course for the Fellow. */
function courseCompletionOnce(teacherId: string, readers: CompletionReaders) {
  const seen = new Map<string, Promise<CourseCompletion>>();
  return (courseId: string) => {
    let found = seen.get(courseId);
    if (!found) {
      found = computeCourseCompletion(teacherId, courseId, readers);
      seen.set(courseId, found);
    }
    return found;
  };
}

/**
 * The Fellow's academy path, built as the learner path route builds it (`GET /api/teacher/academy-path`): every
 * cohort they are enrolled in, its steps, the courses on each step, and the cohorts the path asks for. Only the
 * course flag differs: C3 instead of the stored completion row.
 */
export async function academyPathStatus(
  teacherId: string,
  readers: EligibilityReaders = storageEligibilityReaders,
  courseDone = courseCompletionOnce(teacherId, readers),
) {
  const enrolled = await readers.teacherCohorts(teacherId);
  const cohorts: PathCohort[] = [];
  for (const cohort of enrolled) {
    const steps = await readers.cohortSteps(cohort.id);
    const batches = [];
    for (const step of steps) {
      const courses = [];
      for (const course of step.courses) {
        courses.push({ id: course.courseId, completed: (await courseDone(course.courseId)).complete });
      }
      batches.push({ id: step.id, courses });
    }
    cohorts.push({ id: cohort.id, batches });
  }
  const saved = await readers.cohortsRequired();
  return pathSummary(cohorts, saved ?? (cohorts.length || 1));
}

export type CertificateRequest = { teacherId: string; occasion: "graduation" | "course"; courseId?: string };

/**
 * Why this certificate may not be issued, or null when it may. The issue route sends the refusal as its 400 body.
 * A course certificate also says how far the Fellow is; a graduation certificate says how many cohorts are done.
 */
export async function certificateRefusal(
  input: CertificateRequest,
  readers: EligibilityReaders = storageEligibilityReaders,
) {
  if (input.occasion === "course") {
    const completion = await computeCourseCompletion(input.teacherId, input.courseId || "", readers);
    if (completion.complete) return null;
    return {
      ...refusal("COURSE_INCOMPLETE"),
      doneModules: completion.doneModules,
      totalModules: completion.totalModules,
    };
  }
  const path = await academyPathStatus(input.teacherId, readers);
  if (path.done) return null;
  return {
    ...PATH_INCOMPLETE_REFUSAL,
    cohortsCompleted: path.cohortsCompleted,
    cohortsRequired: path.cohortsRequired,
  };
}

/**
 * Every row the admin eligibility list needs, read once. The list covers every Fellow, and C3 through the
 * storage readers runs several queries per module per Fellow, so the list answers the same reader questions
 * from these rows instead. Each field says which storage reader it stands in for.
 */
export type EligibilityRows = {
  /** `teachers`. Inactive Fellows are left out of the list, as the admin page does. */
  fellows: Array<{ id: string; name: string; approvalStatus?: string | null }>;
  courses: Array<{ id: string; name: string }>;
  /** `batch_teachers` joined to `batches`, as `storage.getBatchesForTeacher`. */
  enrolments: Array<{ teacherId: string; cohort: ScopeCohort }>;
  /** `batch_courses`: the courses a Fellow in the cohort sees (`storage.getCoursesForTeacher`). */
  placements: Array<{ cohortId: string; courseId: string }>;
  /** `cohort_batches` with their `cohort_batch_courses`, as `storageScopeReaders.cohortSteps`. */
  steps: Array<StepRow & { cohortId: string }>;
  /** `training_weeks`, as `storage.getWeeksForCourse`. */
  modules: Array<CompletionModule & { courseId: string }>;
  /** `teacher_content_progress`, as `storage.getAllTeacherContentProgressForWeek`. */
  progress: Array<CompletionProgressRow & { teacherId: string; weekId: string }>;
  /** `quiz_cache` rows with `approved = true`, as `storage.getCachedQuiz(...)?.approved`. */
  approvedQuizzes: Array<{ weekId: string; deckFileId: string }>;
  /**
   * Passing attempts at a lesson-file quiz, as `storage.hasPassedFileQuiz`: `quiz_attempts` with `passed = 'yes'`
   * (the learner is `user_id` or `teacher_id`) and `teacher_content_quiz_attempts` with `passed = 'yes'`.
   */
  passedAttempts: Array<{ weekId: string; deckFileId: string; learnerIds: Array<string | null | undefined> }>;
  cohortsRequired: number | null;
};

const fileKey = (weekId: string, fileId: string) => `${weekId}\u0000${fileId}`;

/** The eligibility readers over rows already in memory. */
export function readersFromRows(rows: EligibilityRows): EligibilityReaders {
  const approved = new Set(rows.approvedQuizzes.map((row) => fileKey(row.weekId, row.deckFileId)));
  const passed = new Map<string, Set<string>>();
  for (const attempt of rows.passedAttempts) {
    const key = fileKey(attempt.weekId, attempt.deckFileId);
    const learners = passed.get(key) ?? new Set<string>();
    for (const id of attempt.learnerIds) if (id) learners.add(id);
    passed.set(key, learners);
  }
  return {
    async modulesForCourse(courseId) {
      return rows.modules.filter((mod) => mod.courseId === courseId);
    },
    async progressForModule(teacherId, moduleId) {
      return rows.progress.filter((row) => row.teacherId === teacherId && row.weekId === moduleId);
    },
    async quizApproved(moduleId, fileId) {
      return approved.has(fileKey(moduleId, fileId));
    },
    async quizPassed(moduleId, fileId, teacherId) {
      return passed.get(fileKey(moduleId, fileId))?.has(teacherId) ?? false;
    },
    async teacherCohorts(teacherId) {
      return rows.enrolments.filter((row) => row.teacherId === teacherId).map((row) => row.cohort);
    },
    async cohortSteps(cohortId) {
      return rows.steps.filter((step) => step.cohortId === cohortId);
    },
    async cohortsRequired() {
      return rows.cohortsRequired;
    },
  };
}

export type EligibleCourse = CourseCompletion & { courseId: string; courseName: string };
export type EligibleFellow = {
  teacherId: string;
  name: string;
  path: { done: boolean; cohortsCompleted: number; cohortsRequired: number };
  courses: EligibleCourse[];
};

/**
 * What the admin certificates page lists: for each active Fellow, whether the path is done (Fellowship and
 * Advanced) and how far they are in each course placed on their cohorts (course certificates). The same rules
 * as `certificateRefusal`; the issue route still decides, through the storage readers.
 */
export async function listEligibleFellows(rows: EligibilityRows): Promise<EligibleFellow[]> {
  const readers = readersFromRows(rows);
  const courseNames = new Map(rows.courses.map((course) => [course.id, course.name]));
  const list: EligibleFellow[] = [];
  for (const fellow of rows.fellows) {
    if (fellow.approvalStatus === "inactive") continue;
    const courseDone = courseCompletionOnce(fellow.id, readers);
    const path = await academyPathStatus(fellow.id, readers, courseDone);
    const cohortIds = new Set((await readers.teacherCohorts(fellow.id)).map((cohort) => cohort.id));
    const courseIds = [...new Set(rows.placements.filter((row) => cohortIds.has(row.cohortId)).map((row) => row.courseId))]
      .filter((courseId) => courseNames.has(courseId));
    const courses: EligibleCourse[] = [];
    for (const courseId of courseIds) {
      courses.push({ courseId, courseName: courseNames.get(courseId)!, ...(await courseDone(courseId)) });
    }
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
    list.push({
      teacherId: fellow.id,
      name: fellow.name,
      path: { done: path.done, cohortsCompleted: path.cohortsCompleted, cohortsRequired: path.cohortsRequired },
      courses,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads `EligibilityRows` from the database: a fixed number of queries, whatever the number of Fellows. */
export async function loadEligibilityRows(): Promise<EligibilityRows> {
  const { db } = await import("./db");
  const schema = await import("@shared/schema");
  const { and, eq, isNotNull } = await import("drizzle-orm");
  const [
    fellows,
    courses,
    enrolments,
    placements,
    steps,
    stepCourses,
    modules,
    progress,
    approvedQuizzes,
    attempts,
    contentAttempts,
    settings,
  ] = await Promise.all([
    db.select({ id: schema.teachers.id, name: schema.teachers.name, approvalStatus: schema.teachers.approvalStatus }).from(schema.teachers),
    db.select({ id: schema.courses.id, name: schema.courses.name }).from(schema.courses),
    db
      .select({ teacherId: schema.batchTeachers.teacherId, cohortId: schema.batches.id, status: schema.batches.status })
      .from(schema.batchTeachers)
      .innerJoin(schema.batches, eq(schema.batchTeachers.batchId, schema.batches.id)),
    db.select({ cohortId: schema.batchCourses.batchId, courseId: schema.batchCourses.courseId }).from(schema.batchCourses),
    db.select().from(schema.cohortBatches),
    db
      .select({
        cohortBatchId: schema.cohortBatchCourses.cohortBatchId,
        courseId: schema.cohortBatchCourses.courseId,
        orderIndex: schema.cohortBatchCourses.orderIndex,
      })
      .from(schema.cohortBatchCourses),
    db.select({ id: schema.trainingWeeks.id, courseId: schema.trainingWeeks.courseId, deckFiles: schema.trainingWeeks.deckFiles }).from(schema.trainingWeeks),
    db
      .select({
        teacherId: schema.teacherContentProgress.teacherId,
        weekId: schema.teacherContentProgress.weekId,
        deckFileId: schema.teacherContentProgress.deckFileId,
        status: schema.teacherContentProgress.status,
        viewedAt: schema.teacherContentProgress.viewedAt,
        completedAt: schema.teacherContentProgress.completedAt,
      })
      .from(schema.teacherContentProgress),
    db
      .select({ weekId: schema.quizCache.weekId, deckFileId: schema.quizCache.deckFileId })
      .from(schema.quizCache)
      .where(eq(schema.quizCache.approved, true)),
    db
      .select({
        weekId: schema.quizAttempts.weekId,
        deckFileId: schema.quizAttempts.deckFileId,
        userId: schema.quizAttempts.userId,
        teacherId: schema.quizAttempts.teacherId,
      })
      .from(schema.quizAttempts)
      .where(and(eq(schema.quizAttempts.passed, "yes"), isNotNull(schema.quizAttempts.deckFileId))),
    db
      .select({
        weekId: schema.teacherContentQuizAttempts.weekId,
        deckFileId: schema.teacherContentQuizAttempts.deckFileId,
        teacherId: schema.teacherContentQuizAttempts.teacherId,
      })
      .from(schema.teacherContentQuizAttempts)
      .where(eq(schema.teacherContentQuizAttempts.passed, "yes")),
    db.select().from(schema.academySettings).where(eq(schema.academySettings.id, PATH_SETTINGS_ID)),
  ]);
  return {
    fellows,
    courses,
    enrolments: enrolments.map((row) => ({ teacherId: row.teacherId, cohort: { id: row.cohortId, status: row.status } })),
    placements,
    steps: steps.map((step) => ({
      id: step.id,
      cohortId: step.cohortId,
      orderIndex: step.orderIndex,
      createdAt: step.createdAt,
      courses: stepCourses
        .filter((link) => link.cohortBatchId === step.id)
        .map((link) => ({ courseId: link.courseId, orderIndex: link.orderIndex })),
    })),
    modules: modules.map((mod) => ({ id: mod.id, courseId: mod.courseId, deckFiles: mod.deckFiles as CompletionModule["deckFiles"] })),
    progress,
    approvedQuizzes,
    passedAttempts: [
      ...attempts.map((row) => ({ weekId: row.weekId, deckFileId: row.deckFileId!, learnerIds: [row.userId, row.teacherId] })),
      ...contentAttempts.map((row) => ({ weekId: row.weekId, deckFileId: row.deckFileId, learnerIds: [row.teacherId] })),
    ],
    cohortsRequired: settings[0]?.cohortsRequired ?? null,
  };
}
