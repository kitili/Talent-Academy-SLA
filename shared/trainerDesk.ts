export type TrainerCohortSummary = {
  id: string;
  name: string;
  teacherCount: number;
  status?: string | null;
  batches: Array<{ id: string; name: string }>;
};

export type TrainerDeskQuiz = {
  status?: string | null;
  paperUrl?: string | null;
};

export type TrainerDeskInput = {
  cohorts: TrainerCohortSummary[];
  quizzes: TrainerDeskQuiz[];
  teacherCount: number;
  attendanceRate: number | null;
  certificateCount: number;
  upcomingEvents: number;
  progressPercent: number | null;
};

export function quizVisibleToTeacher(audience: string[] | undefined, teacherId: string) {
  if (!audience || audience.length === 0) return true;
  return audience.includes(teacherId);
}

export function isWritingExam(quiz: { paperUrl?: string | null; questions?: Array<{ type?: string | null }> | null }) {
  if (quiz.paperUrl) return true;
  const questions = quiz.questions || [];
  return questions.length > 0 && questions.every((question) => question.type === "open_ended");
}

export function mimeFromPaperName(name?: string | null) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export function paperPreviewKind(name?: string | null): "pdf" | "image" | "download" {
  const mime = mimeFromPaperName(name);
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "download";
}

export function summarizeTrainerDesk(input: TrainerDeskInput) {
  const open = input.quizzes.filter((quiz) => (quiz.status || "open") !== "stopped");
  return {
    cohortCount: input.cohorts.length,
    teacherCount: input.teacherCount,
    openQuizzes: open.filter((quiz) => !quiz.paperUrl).length,
    paperExams: open.filter((quiz) => !!quiz.paperUrl).length,
    attendanceRate: input.attendanceRate,
    certificateCount: input.certificateCount,
    upcomingEvents: input.upcomingEvents,
    progressPercent: input.progressPercent,
    cohorts: input.cohorts,
  };
}
