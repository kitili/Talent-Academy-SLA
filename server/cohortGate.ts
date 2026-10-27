import type { Response } from "express";
import { refusal } from "@shared/constants";
import { quizStoppedReason } from "./cohortAccess";
import { lessonQuizGate, type QuizGateModule } from "./learnerQuiz";
import { trainerMayEditCourse } from "./scope";
import { storage } from "./storage";

/** Refuses a teacher's module-quiz submit outside an open cohort for the course, or on a locked module. */
export async function blockTeacherWeekQuiz(res: Response, teacherId: string | undefined, week: QuizGateModule) {
  if (!teacherId) return false;
  const refused = await lessonQuizGate(teacherId, week);
  if (!refused) return false;
  res.status(403).json(refused);
  return true;
}

type Actor = { id?: string; role?: string | null } | null | undefined;

/**
 * The module, if the caller may edit it (D2): an admin, or a trainer whose cohort holds its course.
 * Otherwise sends 404 or 403 `NOT_YOUR_COURSE` and returns null. A module on no course is admin-only.
 */
export async function editableModule(res: Response, user: Actor, weekId: string) {
  const week = await storage.getTrainingWeek(weekId);
  if (!week) {
    res.status(404).json({ error: "Training week not found" });
    return null;
  }
  const allowed = week.courseId ? await trainerMayEditCourse(user, week.courseId) : user?.role === "admin";
  if (!allowed) {
    res.status(403).json(refusal("NOT_YOUR_COURSE"));
    return null;
  }
  return week;
}

/** Refuses a module write on a course the caller may not edit (D2). For a new module, before it exists. */
export async function blockCourseEdit(res: Response, user: Actor, courseId: string | null | undefined) {
  const allowed = courseId ? await trainerMayEditCourse(user, courseId) : user?.role === "admin";
  if (allowed) return false;
  res.status(403).json(refusal("NOT_YOUR_COURSE"));
  return true;
}

export async function blockAssignedQuiz(res: Response, quiz: { batchId: string; status?: string | null }) {
  const batch = await storage.getBatch(quiz.batchId);
  const reason = quizStoppedReason(batch, quiz.status);
  if (!reason) return false;
  res.status(403).json({ error: reason });
  return true;
}
