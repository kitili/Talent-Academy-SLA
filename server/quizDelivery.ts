import type { QuizQuestion } from "@shared/schema";

export function shuffleList<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function shuffleQuestions(questions: QuizQuestion[]) {
  return shuffleList(questions).map((question) => ({
    ...question,
    options: question.options ? shuffleList(question.options) : question.options,
  }));
}

export function passMarkOf(value: unknown, fallback = 80) {
  const mark = Number(value);
  if (!Number.isFinite(mark)) return fallback;
  return Math.min(100, Math.max(1, Math.round(mark)));
}
