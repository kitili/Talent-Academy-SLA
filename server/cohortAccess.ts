/** Whether an admin has left a cohort and its quizzes open for teachers. */

export type CohortGate = {
  status?: string | null;
  quizzesStatus?: string | null;
};

export function courseHealth(input: {
  publishStatus?: string | null;
  enrolledTeachers: number;
  completionPercentage: number;
}) {
  if (input.publishStatus === "draft") return "draft";
  if (input.enrolledTeachers <= 0) return "waiting";
  if (input.completionPercentage >= 80) return "on-track";
  if (input.completionPercentage < 50) return "at-risk";
  return "in-progress";
}

export function quizStoppedReason(
  batch: CohortGate | null | undefined,
  quizStatus?: string | null,
): string | null {
  if (!batch) return "Cohort not found";
  if ((batch.status || "open") === "closed") return "This cohort is closed";
  if ((batch.quizzesStatus || "open") === "stopped") return "Quizzes are stopped for this cohort";
  if ((quizStatus || "open") === "stopped") return "This quiz is stopped";
  return null;
}

/** A teacher can take a course quiz when at least one of their cohorts for it is open. In no cohort for the course, they cannot. */
export function teacherMayTakeQuiz(batches: CohortGate[]): string | null {
  if (batches.length === 0) return "You are not in a cohort for this course";
  if (batches.some((batch) => quizStoppedReason(batch) === null)) return null;
  return quizStoppedReason(batches[0]);
}
