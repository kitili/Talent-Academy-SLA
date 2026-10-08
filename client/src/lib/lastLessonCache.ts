const KEY = "sl-last-lesson";

export type CachedLesson = {
  weekId: string;
  title: string;
  html: string;
  savedAt: string;
};

export function saveLastLesson(lesson: Omit<CachedLesson, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...lesson, savedAt: new Date().toISOString() }));
  } catch {
    // Quota or private mode — ignore
  }
}

export function loadLastLesson(): CachedLesson | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as CachedLesson : null;
  } catch {
    return null;
  }
}
