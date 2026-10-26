/**
 * The Fellow's path through a cohort (Track C): which lesson files are done, which modules and courses
 * are locked, what a course-complete check needs, and who may read a module discussion. The routes in
 * `routes.ts` and the completion writers in `storage.ts` call these, so the rules have one home.
 *
 * The course rule is C3 (`computeCourseCompletion`); the file rule is C2 (`fileIsDone`); course order is
 * C5 (`cohortCourseOrder`, D1). Row readers are arguments; the defaults load `storage` lazily, so tests
 * drive every rule with rows in memory.
 */
import {
  computeCourseCompletion,
  storageCompletionReaders,
  type CompletionModule,
  type CompletionProgressRow,
  type CompletionReaders,
} from "./completion";
import { applyModuleLocks, fileIsDone, moduleIsComplete } from "./progressLogic";
import { cohortCourseOrder, cohortIsOpen, storageScopeReaders, teacherCohortsForCourse, trainerCohortIds, type ScopeReaders } from "./scope";
import { nextCourseToCheck } from "@shared/cohortMedals";
import { refusal, type RefusalCode } from "@shared/constants";

type Actor = { id?: string; role?: string | null } | null | undefined;
type Stamp = Date | string | null | undefined;

// ── Lesson-file progress rows ──────────────────────────────────────────────

/** How far a progress row has got. A write never moves a row back down this list. */
const CONTENT_STATUS_RANK: Record<string, number> = {
  locked: 0,
  available: 1,
  in_progress: 2,
  quiz_required: 2,
  viewed: 2,
  completed: 3,
};

function statusRank(status?: string | null) {
  return status ? (CONTENT_STATUS_RANK[status] ?? 1) : 0;
}

export type ContentProgressWrite = { status?: string | null; viewedAt?: Stamp; completedAt?: Stamp };

/**
 * The row `upsertTeacherContentProgress` writes, given the row already there. The status only moves
 * forward (a pass on file 1 writes file 2 `available`, which must not undo a `completed` or `viewed`
 * file 2), and the first `viewedAt` and `completedAt` are kept, because C3 reads them.
 */
export function mergeContentProgress(existing: ContentProgressWrite | null | undefined, incoming: ContentProgressWrite) {
  const status = incoming.status && statusRank(incoming.status) >= statusRank(existing?.status)
    ? incoming.status
    : existing?.status || incoming.status || "locked";
  return {
    status,
    viewedAt: existing?.viewedAt || incoming.viewedAt || null,
    completedAt: existing?.completedAt || incoming.completedAt || null,
  };
}

/** What "mark read" writes: with no approved quiz the file is done (D6); with one, it is only viewed. */
export function markReadProgress(hasApprovedQuiz: boolean, now: Date): { status: string; viewedAt: Date; completedAt?: Date } {
  return hasApprovedQuiz
    ? { status: "viewed", viewedAt: now }
    : { status: "completed", viewedAt: now, completedAt: now };
}

/**
 * Whether one lesson file is done: C3's file rule. A row already completed stays done (an approval
 * after the Fellow finished does not undo it, D6); otherwise C2 `fileIsDone`.
 */
export function lessonFileDone(row: CompletionProgressRow | null | undefined, hasApprovedQuiz: boolean, quizPassed: boolean) {
  if (row && (row.status === "completed" || row.completedAt)) return true;
  const markedRead = Boolean(row && (row.status === "viewed" || row.viewedAt));
  return fileIsDone({ hasApprovedQuiz, quizPassed, markedRead });
}

export type LessonFileState = {
  fileId: string;
  row?: CompletionProgressRow;
  hasApprovedQuiz: boolean;
  quizPassed: boolean;
  done: boolean;
  /** Files open in order: a file is locked until the one before it is done. */
  locked: boolean;
};

/** Every lesson file of a module, in order, with C3's rule applied. */
export async function lessonFileStates(
  teacherId: string,
  module: CompletionModule,
  readers: CompletionReaders = storageCompletionReaders,
): Promise<LessonFileState[]> {
  const files = module.deckFiles || [];
  const rows = files.length ? await readers.progressForModule(teacherId, module.id) : [];
  const states: LessonFileState[] = [];
  for (const file of files) {
    const row = rows.find((entry) => entry.deckFileId === file.id);
    const [hasApprovedQuiz, quizPassed] = await Promise.all([
      readers.quizApproved(module.id, file.id),
      readers.quizPassed(module.id, file.id, teacherId),
    ]);
    const previous = states[states.length - 1];
    states.push({
      fileId: file.id,
      row,
      hasApprovedQuiz,
      quizPassed,
      done: lessonFileDone(row, hasApprovedQuiz, quizPassed),
      locked: Boolean(previous && !previous.done),
    });
  }
  return states;
}

/** A module's figure for the dashboard. A module with no lesson file is complete (D6). */
export function moduleProgress(states: Array<{ done: boolean }>) {
  const total = states.length;
  const completed = states.filter((state) => state.done).length;
  return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 100 };
}

// ── Course-completion rows ─────────────────────────────────────────────────

export type CourseCompletionWrite = {
  status?: string | null;
  completedAt?: Stamp;
  totalWeeks?: number | null;
  completedWeeks?: number | null;
};

/**
 * The row `upsertTeacherCourseCompletion` writes, given the row already there. A `completed` row stays
 * completed with its first `completedAt` (N5); the module counts follow the latest computation.
 */
export function mergeCourseCompletion(existing: CourseCompletionWrite | null | undefined, incoming: CourseCompletionWrite) {
  const status = existing?.status === "completed" ? "completed" : incoming.status || existing?.status || "in_progress";
  return {
    status,
    completedAt: status === "completed" ? existing?.completedAt || incoming.completedAt || null : null,
    totalWeeks: incoming.totalWeeks ?? existing?.totalWeeks ?? 0,
    completedWeeks: incoming.completedWeeks ?? existing?.completedWeeks ?? 0,
  };
}

/** What the sync writes from C3: completed only when every module is complete; never for an empty course. */
export function completionRowFor(result: { totalModules: number; doneModules: number; complete: boolean }, now: Date) {
  return {
    status: result.complete ? "completed" : "in_progress",
    completedAt: result.complete ? now : (null as Date | null),
    totalWeeks: result.totalModules,
    completedWeeks: result.doneModules,
  };
}

// ── The path through one cohort ────────────────────────────────────────────

export type PathCourse = { id: string; name: string; publishStatus?: string | null };
export type PathCohort = { id: string; status?: string | null };

export type PathReaders = CompletionReaders & {
  /** C5 `cohortCourseOrder`: step order, then unplaced courses by `assigned_at` (D1). */
  courseOrder(cohortId: string): Promise<string[]>;
  /** The courses placed on the cohort (`storage.getCoursesForBatch`). */
  coursesForCohort(cohortId: string): Promise<PathCourse[]>;
  /** Course ids with a `teacher_course_completion` row marked `completed` for this teacher in this cohort. */
  checkedCourseIds(teacherId: string, cohortId: string): Promise<string[]>;
};

export const storagePathReaders: PathReaders = {
  ...storageCompletionReaders,
  courseOrder: (cohortId) => cohortCourseOrder(cohortId),
  async coursesForCohort(cohortId) {
    const { storage } = await import("./storage");
    return storage.getCoursesForBatch(cohortId);
  },
  async checkedCourseIds(teacherId, cohortId) {
    const { db } = await import("./db");
    const { teacherCourseCompletion } = await import("@shared/schema");
    const { and, eq } = await import("drizzle-orm");
    const rows = await db
      .select({ courseId: teacherCourseCompletion.courseId })
      .from(teacherCourseCompletion)
      .where(and(
        eq(teacherCourseCompletion.teacherId, teacherId),
        eq(teacherCourseCompletion.batchId, cohortId),
        eq(teacherCourseCompletion.status, "completed"),
      ));
    return rows.map((row) => row.courseId);
  },
};

/** Remembers module lists and quiz approvals for one request, so a page over many Fellows asks once. */
export function memoizedPathReaders(base: PathReaders = storagePathReaders): PathReaders {
  const modules = new Map<string, Promise<CompletionModule[]>>();
  const approved = new Map<string, Promise<boolean>>();
  return {
    ...base,
    modulesForCourse(courseId) {
      if (!modules.has(courseId)) modules.set(courseId, base.modulesForCourse(courseId));
      return modules.get(courseId)!;
    },
    quizApproved(moduleId, fileId) {
      const key = `${moduleId}/${fileId}`;
      if (!approved.has(key)) approved.set(key, base.quizApproved(moduleId, fileId));
      return approved.get(key)!;
    },
  };
}

type PathModuleRow = CompletionModule & { weekNumber?: number | null };

export type PathModule = CompletionModule & {
  weekNumber: number;
  courseId: string;
  courseName: string;
  batchId: string;
  progress: { total: number; completed: number; percentage: number };
  files: LessonFileState[];
  locked: boolean;
  courseChecked: boolean;
};

/**
 * The courses a Fellow takes in a cohort, in order (D1), with their modules locked by the existing rule
 * (`applyModuleLocks`): a module opens when the module before it is complete, and a course opens when the
 * course before it is complete (a stored `completed` row, or every module complete). Draft courses and
 * courses with no modules are left out, so they never block the next course; a course with no modules is
 * never complete (C2), so it is never offered for checking either. A closed cohort locks every module.
 * `untilCourseId` stops after that course, for callers that need only its locks.
 */
export async function cohortPath(
  teacherId: string,
  cohort: PathCohort,
  readers: PathReaders = storagePathReaders,
  untilCourseId?: string,
) {
  const [order, placed, checked] = await Promise.all([
    readers.courseOrder(cohort.id),
    readers.coursesForCohort(cohort.id),
    readers.checkedCourseIds(teacherId, cohort.id),
  ]);
  const byId = new Map(placed.map((course) => [course.id, course]));
  const modules: Array<Omit<PathModule, "locked">> = [];
  for (const courseId of order) {
    const course = byId.get(courseId);
    if (!course || course.publishStatus === "draft") continue;
    const courseModules = [...await readers.modulesForCourse(courseId) as PathModuleRow[]]
      .sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0));
    // A caller that needs only the locks up to one course skips the files of earlier courses already
    // marked complete: a `completed` row opens the next course whatever its modules show.
    const locksOnly = untilCourseId !== undefined && courseId !== untilCourseId && checked.includes(courseId);
    for (const mod of courseModules) {
      const files = locksOnly ? [] : await lessonFileStates(teacherId, mod, readers);
      modules.push({
        ...mod,
        weekNumber: mod.weekNumber || 0,
        courseId,
        courseName: course.name,
        batchId: cohort.id,
        progress: moduleProgress(files),
        files,
        courseChecked: checked.includes(courseId),
      });
    }
    if (courseId === untilCourseId) break;
  }
  const open = cohortIsOpen(cohort);
  const locked = applyModuleLocks(modules, checked).map((mod) => ({ ...mod, locked: mod.locked || !open }));
  const courseIds = Array.from(new Set(locked.map((mod) => mod.courseId)));
  return { modules: locked as PathModule[], courseIds, checked, nextToCheck: open ? nextCourseToCheck(courseIds, checked) : null };
}

// ── Who may open, mark or discuss a module ─────────────────────────────────

export type Refusal = { status: number; body: { error: string; code?: RefusalCode; locked?: boolean } };

function refuse(status: number, code: RefusalCode, extra: { locked?: boolean } = {}): Refusal {
  return { status, body: { ...refusal(code), ...extra } };
}

export type ModuleAccessReaders = PathReaders & {
  course(courseId: string): Promise<PathCourse | undefined>;
  /** C5 `teacherCohortsForCourse`: open cohorts the teacher is in that hold the course. */
  teacherCohortsForCourse(teacherId: string, courseId: string): Promise<PathCohort[]>;
};

export const storageModuleAccessReaders: ModuleAccessReaders = {
  ...storagePathReaders,
  async course(courseId) {
    const { storage } = await import("./storage");
    return storage.getCourse(courseId);
  },
  teacherCohortsForCourse: (teacherId, courseId) => teacherCohortsForCourse(teacherId, courseId),
};

/**
 * Whether a Fellow may open a module (N4), the rule the content `GET` and "mark read" share: the module's
 * course is published, the Fellow is in an open cohort that holds it, and in at least one of those
 * cohorts the module is unlocked (the module before it, and the course before it, are complete).
 */
export async function teacherModuleAccess(
  teacherId: string,
  module: CompletionModule & { courseId?: string | null },
  readers: ModuleAccessReaders = storageModuleAccessReaders,
): Promise<{ ok: true; module: PathModule } | { ok: false; refusal: Refusal }> {
  const courseId = module.courseId || "";
  const course = courseId ? await readers.course(courseId) : undefined;
  if (!course || course.publishStatus === "draft") {
    return { ok: false, refusal: { status: 404, body: { error: "Module not found" } } };
  }
  const cohorts = await readers.teacherCohortsForCourse(teacherId, courseId);
  if (cohorts.length === 0) return { ok: false, refusal: refuse(403, "NOT_ENROLLED") };
  for (const cohort of cohorts) {
    const path = await cohortPath(teacherId, cohort, readers, courseId);
    const mine = path.modules.find((mod) => mod.id === module.id);
    if (mine && !mine.locked) return { ok: true, module: mine };
  }
  return { ok: false, refusal: refuse(403, "MODULE_LOCKED", { locked: true }) };
}

/**
 * Whether a Fellow may check a course complete in a cohort (finding 1): the course is the next one to
 * check in cohort order, it is unlocked, and C3 says every module is complete. Returns the refusal, or null.
 */
export function courseCheckRefusal(input: {
  courseId: string;
  placed: boolean;
  path: { courseIds: string[]; nextToCheck: string | null; modules: Array<{ courseId: string; locked: boolean }> };
  completion: { complete: boolean };
}): Refusal | null {
  const { courseId, path, completion } = input;
  if (!input.placed) return { status: 404, body: { error: "That course is not in this cohort" } };
  // A draft course, or one with no modules, is not on the path: there is nothing to finish.
  if (!path.courseIds.includes(courseId)) return refuse(400, "COURSE_INCOMPLETE");
  if (path.nextToCheck !== courseId) {
    return { status: 400, body: { error: path.nextToCheck ? "Finish the course before this one first" : "Every course in this cohort is already complete" } };
  }
  // The course's first module carries the course lock (the course before it is not complete).
  if (path.modules.find((mod) => mod.courseId === courseId)?.locked) {
    return refuse(403, "MODULE_LOCKED", { locked: true });
  }
  if (!completion.complete) return refuse(400, "COURSE_INCOMPLETE");
  return null;
}

/** The C3 result for the course a Fellow may check next, so the dashboard flag and the route agree. */
export async function nextCourseCompletion(teacherId: string, nextToCheck: string | null, readers: CompletionReaders = storageCompletionReaders) {
  if (!nextToCheck) return null;
  return computeCourseCompletion(teacherId, nextToCheck, readers);
}

export type DiscussionReaders = Pick<ScopeReaders, "cohortIdsHoldingCourse"> & {
  teacherCohortsForCourse(teacherId: string, courseId: string): Promise<PathCohort[]>;
  trainerCohortIds(trainerId: string): Promise<string[]>;
  teacherIdsInCohort(cohortId: string): Promise<string[]>;
};

export const storageDiscussionReaders: DiscussionReaders = {
  cohortIdsHoldingCourse: (courseId) => storageScopeReaders.cohortIdsHoldingCourse(courseId),
  teacherCohortsForCourse: (teacherId, courseId) => teacherCohortsForCourse(teacherId, courseId),
  trainerCohortIds: (trainerId) => trainerCohortIds(trainerId),
  async teacherIdsInCohort(cohortId) {
    const { storage } = await import("./storage");
    return (await storage.getTeachersInBatch(cohortId)).map((teacher) => teacher.id);
  },
};

/**
 * Who may read or post in a module discussion (D11): a Fellow in an open cohort that holds the module's
 * course, an admin, or a trainer who runs a cohort that holds it. A Fellow or trainer sees the posts of
 * Fellows in those cohorts only (and every staff post); `authors: null` means every post (admin).
 */
export async function discussionAccess(
  actor: { teacherId?: string; user?: Actor },
  courseId: string | null | undefined,
  readers: DiscussionReaders = storageDiscussionReaders,
): Promise<{ ok: true; authors: Set<string> | null } | { ok: false; refusal: Refusal }> {
  if (actor.teacherId) {
    const cohorts = courseId ? await readers.teacherCohortsForCourse(actor.teacherId, courseId) : [];
    if (cohorts.length === 0) return { ok: false, refusal: refuse(403, "NOT_ENROLLED") };
    return { ok: true, authors: await fellowsIn(cohorts.map((cohort) => cohort.id), readers) };
  }
  const user = actor.user;
  if (user?.role === "admin") return { ok: true, authors: null };
  if (user?.role !== "trainer" || !user.id || !courseId) return { ok: false, refusal: refuse(403, "NOT_YOUR_COURSE") };
  const [mine, holding] = await Promise.all([readers.trainerCohortIds(user.id), readers.cohortIdsHoldingCourse(courseId)]);
  const held = new Set(holding);
  const shared = mine.filter((cohortId) => held.has(cohortId));
  if (shared.length === 0) return { ok: false, refusal: refuse(403, "NOT_YOUR_COURSE") };
  return { ok: true, authors: await fellowsIn(shared, readers) };
}

async function fellowsIn(cohortIds: string[], readers: DiscussionReaders) {
  const ids = new Set<string>();
  for (const cohortId of cohortIds) {
    for (const id of await readers.teacherIdsInCohort(cohortId)) ids.add(id);
  }
  return ids;
}

/** The posts a reader may see: every staff post, and Fellows' posts from the reader's cohorts. */
export function visibleDiscussionPosts<T extends { authorId: string; authorRole: string }>(posts: T[], authors: Set<string> | null): T[] {
  if (!authors) return posts;
  return posts.filter((post) => post.authorRole !== "teacher" || authors.has(post.authorId));
}

/**
 * Whether staff may read a Fellow's history in a module: an admin, or a trainer running a cohort that
 * both enrolls the Fellow and holds the module's course.
 */
export async function trainerMaySeeTeacherModule(
  user: Actor,
  teacherId: string,
  courseId: string | null | undefined,
  readers: Pick<DiscussionReaders, "trainerCohortIds" | "cohortIdsHoldingCourse" | "teacherIdsInCohort"> = storageDiscussionReaders,
): Promise<boolean> {
  if (user?.role === "admin") return true;
  if (user?.role !== "trainer" || !user.id || !courseId) return false;
  const [mine, holding] = await Promise.all([readers.trainerCohortIds(user.id), readers.cohortIdsHoldingCourse(courseId)]);
  const held = new Set(holding);
  for (const cohortId of mine) {
    if (!held.has(cohortId)) continue;
    if ((await readers.teacherIdsInCohort(cohortId)).includes(teacherId)) return true;
  }
  return false;
}

// ── Medals and trainer figures, per cohort ─────────────────────────────────

/**
 * Quiz signals for one cohort's medals (finding 22): module-quiz attempts in the cohort's modules, and
 * trainer exams set for the cohort. A quiz answered in another cohort earns nothing here.
 */
export function cohortQuizSignals(input: {
  cohortId: string;
  moduleIds: Set<string>;
  moduleAttempts: Array<{ weekId: string; passed: string }>;
  examAttempts: Array<{ batchId: string | null; passed: string }>;
}) {
  const mine = [
    ...input.moduleAttempts.filter((attempt) => input.moduleIds.has(attempt.weekId)),
    ...input.examAttempts.filter((attempt) => attempt.batchId === input.cohortId),
  ];
  return {
    questionsAnswered: mine.length,
    quizzesPassed: mine.filter((attempt) => attempt.passed === "yes").length,
  };
}

export type TeacherAttempts = {
  moduleAttempts: Array<{ weekId: string; passed: string }>;
  examAttempts: Array<{ batchId: string | null; passed: string }>;
};

/** Every quiz attempt of a Fellow: module quizzes (both attempt tables) and trainer exams with their cohort. */
export async function readTeacherAttempts(teacherId: string): Promise<TeacherAttempts> {
  const { db } = await import("./db");
  const { assignedQuizzes, quizAttempts, teacherContentQuizAttempts, teacherQuizAttempts } = await import("@shared/schema");
  const { eq, or } = await import("drizzle-orm");
  const [fileRows, contentRows, examRows] = await Promise.all([
    db.select({ weekId: quizAttempts.weekId, passed: quizAttempts.passed })
      .from(quizAttempts)
      .where(or(eq(quizAttempts.teacherId, teacherId), eq(quizAttempts.userId, teacherId))),
    db.select({ weekId: teacherContentQuizAttempts.weekId, passed: teacherContentQuizAttempts.passed })
      .from(teacherContentQuizAttempts)
      .where(eq(teacherContentQuizAttempts.teacherId, teacherId)),
    db.select({ batchId: assignedQuizzes.batchId, passed: teacherQuizAttempts.passed })
      .from(teacherQuizAttempts)
      .innerJoin(assignedQuizzes, eq(teacherQuizAttempts.assignedQuizId, assignedQuizzes.id))
      .where(eq(teacherQuizAttempts.teacherId, teacherId)),
  ]);
  return { moduleAttempts: [...fileRows, ...contentRows], examAttempts: examRows };
}

/** `cohortQuizSignals` for one Fellow in one cohort, over the modules on their path there. */
export async function cohortQuizSignalsFor(
  teacherId: string,
  cohortId: string,
  modules: Array<{ id: string }>,
  read: (teacherId: string) => Promise<TeacherAttempts> = readTeacherAttempts,
) {
  return cohortQuizSignals({ cohortId, moduleIds: new Set(modules.map((mod) => mod.id)), ...await read(teacherId) });
}

/**
 * A Fellow's course figures in one cohort, by the path rule: the courses that count are the ones on the
 * path (published, with modules), and a course is done when its row is `completed` or C3 says complete.
 */
export function cohortCourseFigures(path: { courseIds: string[]; checked: string[]; modules: PathModule[] }) {
  const courses = path.courseIds.map((courseId) => {
    const modules = path.modules.filter((mod) => mod.courseId === courseId);
    const doneModules = modules.filter((mod) => moduleIsComplete(mod.progress)).length;
    const complete = path.checked.includes(courseId) || (modules.length > 0 && doneModules === modules.length);
    const started = complete || modules.some((mod) => mod.files.some((file) => file.done));
    return {
      started,
      courseId,
      courseName: modules[0]?.courseName || "Course",
      status: complete ? "completed" : "in_progress",
      completedModules: doneModules,
      totalModules: modules.length,
      percentage: complete ? 100 : modules.length > 0 ? Math.round((doneModules / modules.length) * 100) : 0,
    };
  });
  const completedCount = courses.filter((course) => course.status === "completed").length;
  return {
    courses: courses.map(({ started, ...course }) => course),
    completedCount,
    inProgressCount: courses.filter((course) => course.started && course.status !== "completed").length,
    notStartedCount: courses.filter((course) => !course.started).length,
    overallPercentage: courses.length > 0 ? Math.round((completedCount / courses.length) * 100) : 0,
  };
}
