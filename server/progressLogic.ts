export type ModuleProgress = {
  percentage?: number;
  total?: number;
  completed?: number;
};

export type ModuleWeek = {
  courseId?: string;
  courseName?: string;
  weekNumber?: number;
  progress?: ModuleProgress;
};

export function moduleIsComplete(progress?: ModuleProgress): boolean {
  if (!progress) return false;
  if ((progress.total ?? -1) === 0) return true;
  if ((progress.percentage || 0) >= 100) return true;
  return (progress.total || 0) > 0 && (progress.completed || 0) >= (progress.total || 0);
}

export function applyModuleLocks<T extends ModuleWeek>(weeks: T[]): Array<T & { locked: boolean }> {
  const courseOrder: string[] = [];
  for (const week of weeks) {
    const key = week.courseId || week.courseName || "";
    if (key && !courseOrder.includes(key)) courseOrder.push(key);
  }

  const sorted = [...weeks].sort((a, b) => {
    const ai = courseOrder.indexOf(a.courseId || a.courseName || "");
    const bi = courseOrder.indexOf(b.courseId || b.courseName || "");
    if (ai !== bi) return ai - bi;
    return (a.weekNumber || 0) - (b.weekNumber || 0);
  });

  const modulesByCourse = new Map<string, T[]>();
  for (const week of sorted) {
    const key = week.courseId || week.courseName || "";
    const list = modulesByCourse.get(key) || [];
    list.push(week);
    modulesByCourse.set(key, list);
  }

  const courseComplete = new Map<string, boolean>();
  for (const [key, list] of modulesByCourse) {
    courseComplete.set(key, list.every(week => moduleIsComplete(week.progress)));
  }

  const previousByCourse = new Map<string, T>();
  return sorted.map((week) => {
    const key = week.courseId || week.courseName || "";
    const previous = previousByCourse.get(key);
    const courseIndex = courseOrder.indexOf(key);
    const previousCourseKey = courseIndex > 0 ? courseOrder[courseIndex - 1] : "";
    const lockedByPreviousModule = !!previous && !moduleIsComplete(previous.progress);
    const lockedByPreviousCourse = !!previousCourseKey && !courseComplete.get(previousCourseKey);
    previousByCourse.set(key, week);
    return { ...week, locked: lockedByPreviousModule || lockedByPreviousCourse };
  });
}

export function batchRiskStatus(
  trackedCount: number,
  completionPercentage: number,
): "on-track" | "at-risk" {
  return trackedCount === 0 || completionPercentage >= 50 ? "on-track" : "at-risk";
}

export function isAtRiskFellow(totalWeeks: number, completedWeeks: number): boolean {
  if (!totalWeeks || totalWeeks <= 0) return false;
  return (completedWeeks / totalWeeks) * 100 < 30;
}

export function moduleCoveragePercentage(completedModules: number, totalModules: number): number {
  if (totalModules <= 0) return 0;
  return Math.round((completedModules / totalModules) * 1000) / 10;
}

export function isCourseComplete(completedModules: number, totalModules: number): boolean {
  if (totalModules <= 0) return false;
  const pct = Math.round((completedModules / totalModules) * 100);
  return completedModules >= totalModules || pct >= 90;
}

export type NamedCourseCompletion = {
  courseName: string;
  teacherName: string;
  status: string;
};

export function teachersWhoCompletedEachCourse(
  rows: NamedCourseCompletion[],
): Array<{ courseName: string; teachers: string[] }> {
  const byCourse = new Map<string, string[]>();
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const names = byCourse.get(row.courseName) || [];
    if (!names.includes(row.teacherName)) names.push(row.teacherName);
    byCourse.set(row.courseName, names);
  }
  return [...byCourse.entries()].map(([courseName, teachers]) => ({ courseName, teachers }));
}

export function formatCourseProgress(
  status: string,
  completedModules: number,
  totalModules: number,
): string {
  if (status === "completed" || isCourseComplete(completedModules, totalModules)) {
    return "Completed";
  }
  if (!totalModules) return "In progress";
  return `${completedModules}/${totalModules} modules`;
}

export function scoreQuizSubmission(
  questions: Array<{ id: string; type?: string; correctAnswer?: string }>,
  answers: Record<string, string>,
): { score: number; totalQuestions: number; passed: boolean; percentage: number } {
  const graded = questions.filter(q => q.type !== "open_ended");
  const openEnded = questions.filter(q => q.type === "open_ended");
  let correct = 0;
  for (const q of graded) {
    if (answers[q.id] === q.correctAnswer) correct++;
  }
  const openEndedAnswered = openEnded.filter(q => (answers[q.id] || "").trim().length > 0).length;
  const totalGraded = graded.length;
  const passed = totalGraded === 0
    ? openEnded.length > 0 && openEndedAnswered === openEnded.length
    : correct >= Math.ceil(totalGraded * 0.7);
  const totalQuestions = totalGraded > 0 ? totalGraded : questions.length;
  const score = totalGraded > 0 ? correct : openEndedAnswered;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  return { score, totalQuestions, passed, percentage };
}
