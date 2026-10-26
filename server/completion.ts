/**
 * Whether a teacher has completed a course (C3), computed from progress rows, quiz approval and quiz
 * passes, never from the stored `teacher_course_completion.status`. The rules are C2 in `progressLogic.ts`.
 * The row readers are an argument; the defaults load `storage` lazily, so tests use rows in memory.
 */
import { fileIsDone, isCourseComplete, moduleIsComplete } from "./progressLogic";

export type CompletionModule = { id: string; deckFiles?: Array<{ id: string }> | null };
export type CompletionProgressRow = {
  deckFileId: string;
  status?: string | null;
  viewedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

export type CompletionReaders = {
  /** Every module of the course (`storage.getWeeksForCourse`). */
  modulesForCourse(courseId: string): Promise<CompletionModule[]>;
  /** The teacher's progress rows for one module (`storage.getAllTeacherContentProgressForWeek`). */
  progressForModule(teacherId: string, moduleId: string): Promise<CompletionProgressRow[]>;
  /** Whether the lesson file has an approved quiz (`storage.getCachedQuiz(weekId, fileId)?.approved`, C8). */
  quizApproved(moduleId: string, fileId: string): Promise<boolean>;
  /** Whether the teacher has a passing attempt at the lesson file's quiz (`storage.hasPassedFileQuiz`). */
  quizPassed(moduleId: string, fileId: string, teacherId: string): Promise<boolean>;
};

export const storageCompletionReaders: CompletionReaders = {
  async modulesForCourse(courseId) {
    const { storage } = await import("./storage");
    return storage.getWeeksForCourse(courseId);
  },
  async progressForModule(teacherId, moduleId) {
    const { storage } = await import("./storage");
    return storage.getAllTeacherContentProgressForWeek(teacherId, moduleId);
  },
  async quizApproved(moduleId, fileId) {
    const { storage } = await import("./storage");
    const cached = await storage.getCachedQuiz(moduleId, fileId);
    return cached?.approved === true;
  },
  async quizPassed(moduleId, fileId, teacherId) {
    const { storage } = await import("./storage");
    return storage.hasPassedFileQuiz(moduleId, fileId, teacherId);
  },
};

export type CourseCompletion = { totalModules: number; doneModules: number; complete: boolean };

/**
 * Every module counts, with or without lesson files (D4, D6). A lesson file is done by `fileIsDone`, or
 * when its progress row already records it completed: a quiz approved after the teacher finished the
 * file does not undo their progress (D6). `completedAt` survives a later `available` status write.
 */
export async function computeCourseCompletion(
  teacherId: string,
  courseId: string,
  readers: CompletionReaders = storageCompletionReaders,
): Promise<CourseCompletion> {
  const modules = await readers.modulesForCourse(courseId);
  let doneModules = 0;
  for (const mod of modules) {
    const files = mod.deckFiles || [];
    if (files.length === 0) {
      doneModules++;
      continue;
    }
    const progress = await readers.progressForModule(teacherId, mod.id);
    let doneFiles = 0;
    for (const file of files) {
      const row = progress.find((entry) => entry.deckFileId === file.id);
      if (row && (row.status === "completed" || row.completedAt)) {
        doneFiles++;
        continue;
      }
      const [hasApprovedQuiz, quizPassed] = await Promise.all([
        readers.quizApproved(mod.id, file.id),
        readers.quizPassed(mod.id, file.id, teacherId),
      ]);
      const markedRead = Boolean(row && (row.status === "viewed" || row.viewedAt));
      if (fileIsDone({ hasApprovedQuiz, quizPassed, markedRead })) doneFiles++;
    }
    if (moduleIsComplete({ total: files.length, completed: doneFiles })) doneModules++;
  }
  const totalModules = modules.length;
  return { totalModules, doneModules, complete: isCourseComplete(doneModules, totalModules) };
}
