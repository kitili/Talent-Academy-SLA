/** What a teacher may see of a quiz, how their answers are graded, and when a course may be checked complete. */

import type { QuizQuestion } from "@shared/schema";
import { QUIZ_ATTEMPTS, refusal, type RefusalCode } from "@shared/constants";
import { scoreQuizSubmission } from "./progressLogic";
import { quizStoppedReason, teacherMayTakeQuiz, type CohortGate } from "./cohortAccess";
import { cohortCourseOrder, storageScopeReaders, teacherCohortsForCourse, type ScopeReaders } from "./scope";
import { computeCourseCompletion, storageCompletionReaders, type CompletionModule, type CompletionReaders } from "./completion";
import { cohortPath, storagePathReaders, type PathReaders } from "./learnerPath";

type StoredQuestion = {
  id: string;
  question: string;
  type?: string;
  options?: string[];
  correctAnswer?: string;
  timeLimit?: number;
};

type CachedQuiz = { approved?: boolean | null; questions?: StoredQuestion[] | null } | null | undefined;

/** A question as a teacher receives it. Only named fields are copied, so no answer or explanation can ride along. */
export function learnerQuestion(question: StoredQuestion) {
  const projected: Partial<QuizQuestion> & { id: string; question: string } = {
    id: question.id,
    question: question.question,
  };
  if (question.type !== undefined) projected.type = question.type as QuizQuestion["type"];
  if (question.options !== undefined) projected.options = question.options;
  if (question.timeLimit !== undefined) projected.timeLimit = question.timeLimit;
  return projected;
}

export function learnerQuestions(questions: StoredQuestion[] | null | undefined) {
  return (questions || []).map(learnerQuestion);
}

/** An assigned quiz (or anything carrying `questions`) with the answers taken out. */
export function learnerQuiz<T extends { questions?: StoredQuestion[] | null }>(quiz: T): T {
  return { ...quiz, questions: learnerQuestions(quiz.questions) };
}

/** A cached lesson quiz a teacher can take: approved and holding at least one question. */
export function isLiveLessonQuiz(cached: CachedQuiz): boolean {
  return !!(cached && cached.approved && (cached.questions || []).length > 0);
}

/**
 * Per-question result for the teacher's results screen. Which answers were right is always
 * returned; the correct answer itself only when `reveal` is true (the attempt passed).
 */
export function answerReview(
  questions: StoredQuestion[],
  answers: Record<string, string>,
  reveal: boolean,
) {
  return questions.map((question) => {
    const openEnded = question.type === "open_ended";
    const item: { id: string; correct: boolean | null; correctAnswer?: string } = {
      id: question.id,
      correct: openEnded ? null : answers[question.id] === question.correctAnswer,
    };
    if (reveal && !openEnded) item.correctAnswer = question.correctAnswer;
    return item;
  });
}

/**
 * Grades a lesson-quiz submission against the stored quiz on the server. Questions in the request
 * body are never used. A teacher needs an approved quiz; staff may grade an unapproved preview.
 */
export function gradeLessonQuiz<Q extends StoredQuestion>(input: {
  cached: { approved?: boolean | null; questions?: Q[] | null } | null | undefined;
  answers: unknown;
  staff: boolean;
}):
  | { error: string; status: 400 | 404 }
  | {
    questions: Q[];
    answers: Record<string, string>;
    graded: ReturnType<typeof scoreQuizSubmission>;
    review: ReturnType<typeof answerReview>;
  } {
  const { cached, staff } = input;
  if (!input.answers || typeof input.answers !== "object" || Array.isArray(input.answers)) {
    return { error: "Invalid quiz submission", status: 400 };
  }
  const questions = cached?.questions || [];
  const usable = staff ? questions.length > 0 : isLiveLessonQuiz(cached);
  if (!usable) return { error: "This lesson has no approved quiz yet", status: 404 };
  const answers: Record<string, string> = {};
  for (const [id, value] of Object.entries(input.answers as Record<string, unknown>)) {
    if (typeof value === "string") answers[id] = value;
  }
  const graded = scoreQuizSubmission(questions, answers);
  return { questions, answers, graded, review: answerReview(questions, answers, graded.passed) };
}

export type LessonQuizState = { weekId: string; fileId: string; hasApprovedQuiz: boolean; passed: boolean };

/** A course may be checked complete when every lesson with an approved quiz has a passing attempt. Lessons with no approved quiz do not block. */
export function courseQuizzesPassed(lessons: LessonQuizState[]): boolean {
  return lessons.every((lesson) => !lesson.hasApprovedQuiz || lesson.passed);
}

export type LessonQuizSource = {
  getWeeksForCourse(courseId: string): Promise<Array<{ id: string; deckFiles?: Array<{ id: string }> | null }>>;
  getCachedQuiz(weekId: string, fileId: string): Promise<CachedQuiz>;
  hasPassedFileQuiz(weekId: string, fileId: string, teacherId: string): Promise<boolean>;
};

/** Every lesson file in a course, with whether it has an approved quiz and whether this teacher passed it. */
export async function lessonQuizStates(
  source: LessonQuizSource,
  courseId: string,
  teacherId: string,
): Promise<LessonQuizState[]> {
  const states: LessonQuizState[] = [];
  for (const week of await source.getWeeksForCourse(courseId)) {
    for (const file of week.deckFiles || []) {
      const hasApprovedQuiz = isLiveLessonQuiz(await source.getCachedQuiz(week.id, file.id));
      const passed = hasApprovedQuiz && await source.hasPassedFileQuiz(week.id, file.id, teacherId);
      states.push({ weekId: week.id, fileId: file.id, hasApprovedQuiz, passed });
    }
  }
  return states;
}

/** The rule both `POST /api/teacher/courses/:courseId/complete` and the `canCheckComplete` flag use. */
export async function teacherMayCheckCourse(source: LessonQuizSource, courseId: string, teacherId: string) {
  return courseQuizzesPassed(await lessonQuizStates(source, courseId, teacherId));
}

/**
 * What a module-quiz read gives the viewer. Staff preview any quiz with its answers; anyone else gets
 * an approved quiz without answers, or nothing, so a cached draft never reaches a learner.
 */
export function lessonQuizForViewer(cached: CachedQuiz, staff: boolean) {
  if (!cached || (cached.questions || []).length === 0) return null;
  if (staff) return { questions: cached.questions || [], approved: !!cached.approved };
  if (!isLiveLessonQuiz(cached)) return null;
  return { questions: learnerQuestions(cached.questions), approved: true };
}

type AttemptScore = { score: number; totalQuestions: number };

/**
 * Where a teacher stands on one assigned quiz. Retakes stop after a pass or after QUIZ_ATTEMPTS
 * attempts, and only then may the teacher read the correct answers.
 */
export function assignedQuizStanding(attempts: AttemptScore[], passMark: number) {
  const hasPassed = attempts.some((attempt) =>
    attempt.totalQuestions > 0 && (attempt.score / attempt.totalQuestions) * 100 >= passMark);
  const attemptsUsed = attempts.length;
  const canRetake = !hasPassed && attemptsUsed < QUIZ_ATTEMPTS;
  return {
    hasPassed,
    attemptsUsed,
    remainingAttempts: Math.max(0, QUIZ_ATTEMPTS - attemptsUsed),
    canRetake,
    showAnswers: !canRetake,
  };
}

/** An assigned quiz as an attempt read returns it: with answers once the teacher can no longer retake, without before. */
export function attemptQuizView<T extends { questions?: StoredQuestion[] | null }>(quiz: T, standing: { showAnswers: boolean }): T {
  return standing.showAnswers ? quiz : learnerQuiz(quiz);
}

export type QuizGateModule = { id: string; courseId?: string | null };

export type QuizGateReaders = {
  /** The teacher's open cohorts holding the course (C5 `teacherCohortsForCourse`). */
  cohortsForCourse(teacherId: string, courseId: string): Promise<Array<CohortGate & { id: string }>>;
  /** The readers of the Fellow's path through a cohort (Track C `cohortPath`), which decides locks. */
  path: PathReaders;
};

/** The gate's readers over C5, and Track C's path readers over C3 and C5. */
export function quizGateReaders(
  completion: CompletionReaders = storageCompletionReaders,
  scope: ScopeReaders = storageScopeReaders,
  path: Partial<PathReaders> = {},
): QuizGateReaders {
  return {
    cohortsForCourse: (teacherId, courseId) => teacherCohortsForCourse(teacherId, courseId, scope),
    path: {
      ...storagePathReaders,
      ...completion,
      courseOrder: (cohortId) => cohortCourseOrder(cohortId, scope),
      ...path,
    },
  };
}

export const storageQuizGateReaders: QuizGateReaders = quizGateReaders();

/**
 * Whether a teacher may submit this module's quiz. Refused with NOT_ENROLLED when no open cohort of
 * theirs holds the course (C5), when every such cohort has quizzes stopped, and with MODULE_LOCKED
 * when the module is locked on the Fellow's path in every cohort where quizzes run. Locks come from
 * Track C's `cohortPath`, the same path the desk and the module page use, so the quiz and the module
 * never disagree (a course with no modules, for one, never blocks the next).
 * One cohort that lets them through is enough, as `teacherMayTakeQuiz` already says.
 */
export async function lessonQuizGate(
  teacherId: string,
  module: QuizGateModule,
  readers: QuizGateReaders = storageQuizGateReaders,
): Promise<{ error: string; code?: RefusalCode } | null> {
  const courseId = module.courseId || "";
  const cohorts = courseId ? await readers.cohortsForCourse(teacherId, courseId) : [];
  if (cohorts.length === 0) return refusal("NOT_ENROLLED");
  const stopped = teacherMayTakeQuiz(cohorts);
  if (stopped) return { error: stopped };

  for (const cohort of cohorts) {
    if (quizStoppedReason(cohort) !== null) continue;
    const path = await cohortPath(teacherId, cohort, readers.path, courseId);
    const mine = path.modules.find((entry) => entry.id === module.id);
    if (mine && !mine.locked) return null;
  }
  return refusal("MODULE_LOCKED");
}
