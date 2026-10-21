/**
 * Medals inside a cohort, in the spirit of a GitHub achievement.
 * Most are earned from the teacher's own work. The trainer star is given by hand.
 */

export const MEDAL_KINDS = [
  "first-step",
  "keeping-time",
  "questions",
  "quiz-pass",
  "strong-progress",
  "course-done",
  "trainer-star",
] as const;

export type MedalKind = (typeof MEDAL_KINDS)[number];

export type MedalSignals = {
  progressPercentage: number;
  coursesCompleted: number;
  attendanceRate: number;
  attendanceDays: number;
  questionsAnswered: number;
  quizzesPassed: number;
  trainerStar: boolean;
};

export type Medal = {
  kind: MedalKind;
  title: string;
  detail: string;
  earned: boolean;
};

const COPY: Record<MedalKind, { title: string; detail: string }> = {
  "first-step": { title: "First step", detail: "Started this cohort" },
  "keeping-time": { title: "Keeping time", detail: "Attendance is steady" },
  questions: { title: "Answering", detail: "Answered quiz questions" },
  "quiz-pass": { title: "Quiz pass", detail: "Passed a quiz" },
  "strong-progress": { title: "Strong progress", detail: "Academic work is moving well" },
  "course-done": { title: "Course done", detail: "Checked a course complete and can move on" },
  "trainer-star": { title: "Trainer star", detail: "Given by the trainer" },
};

export function cohortMedals(signals: MedalSignals): Medal[] {
  const started = signals.progressPercentage > 0
    || signals.coursesCompleted > 0
    || signals.questionsAnswered > 0
    || signals.attendanceDays > 0;
  const earned: Record<MedalKind, boolean> = {
    "first-step": started,
    "keeping-time": signals.attendanceDays > 0 && signals.attendanceRate >= 80,
    questions: signals.questionsAnswered > 0,
    "quiz-pass": signals.quizzesPassed > 0,
    "strong-progress": signals.progressPercentage >= 60 || signals.coursesCompleted > 0,
    "course-done": signals.coursesCompleted > 0,
    "trainer-star": signals.trainerStar,
  };
  return MEDAL_KINDS.map((kind) => ({ kind, ...COPY[kind], earned: earned[kind] }));
}

/** The first course in order that the teacher has not checked complete. */
export function nextCourseToCheck(courseIdsInOrder: string[], completedIds: string[]): string | null {
  const done = new Set(completedIds);
  return courseIdsInOrder.find((id) => id && !done.has(id)) ?? null;
}
