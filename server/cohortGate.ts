import type { Response } from "express";
import { quizStoppedReason, teacherMayTakeQuiz } from "./cohortAccess";
import { storage } from "./storage";

export async function blockTeacherWeekQuiz(res: Response, teacherId: string | undefined, weekId: string) {
  if (!teacherId) return false;
  const week = await storage.getTrainingWeek(weekId);
  if (!week) return false;
  const enrolled = await storage.getBatchesForTeacher(teacherId);
  const matching = [];
  for (const batch of enrolled) {
    const courses = await storage.getCoursesForBatch(batch.id);
    if (courses.some((course) => course.id === week.courseId)) matching.push(batch);
  }
  const reason = teacherMayTakeQuiz(matching);
  if (!reason) return false;
  res.status(403).json({ error: reason });
  return true;
}

export async function blockAssignedQuiz(res: Response, quiz: { batchId: string; status?: string | null }) {
  const batch = await storage.getBatch(quiz.batchId);
  const reason = quizStoppedReason(batch, quiz.status);
  if (!reason) return false;
  res.status(403).json({ error: reason });
  return true;
}
