/**
 * Pure rules of the Fellow desk (client/src/pages/teacher-dashboard.tsx, teacher-exam.tsx): which section a link opens,
 * which stored link may be clickable, how the Assessments list is ordered, and the rows of the progress chart.
 * Nothing here reads the page, so tests/unit/fellow-desk can run it.
 */

/** The Fellow desk's sections. Keys are DESK_MENUS.fellow's (the shell draws the menu). */
export const FELLOW_TABS = ["home", "learning", "assessments", "progress", "reflect", "messages"] as const;
export type FellowTab = (typeof FELLOW_TABS)[number];

/** Old section names (and the old `quiz`) that now open Assessments, so a saved link or an old notice still lands. */
const RETIRED_TABS: Record<string, FellowTab> = { work: "assessments", quizzes: "assessments", quiz: "assessments" };

/** The section a location opens: `?tab=` first, then an old `#my-learning` / `#my-work` hash, else Home. */
export function tabFromUrl(search: string, hash: string): FellowTab {
  const asked = new URLSearchParams(search).get("tab") || "";
  if (RETIRED_TABS[asked]) return RETIRED_TABS[asked];
  if ((FELLOW_TABS as readonly string[]).includes(asked)) return asked as FellowTab;
  if (hash === "#my-learning") return "learning";
  if (hash === "#my-work") return "assessments";
  return "home";
}

/** Work's calendar panel is gone; an old `?tab=work#my-calendar` link goes to the Calendar page, which holds it now. */
export function fellowDeskRedirect(hash: string): string | null {
  return hash === "#my-calendar" ? "/calendar" : null;
}

/**
 * A stored file or link, as an address a page may link to: only `http(s)://` or a path on this site. Anything else
 * (an old stored `javascript:` or `data:` value, a protocol-relative `//host`) gives nothing, so it is never clickable.
 */
export function safeFileHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (/^https?:\/\/\S+$/i.test(href)) return href;
  if (/^\/(?![/\\])\S*$/.test(href)) return href;
  return null;
}

/** What one Assessments row needs, whatever it is. `done` is handed in, passed or finished; `closed` is the server's. */
export type AssessmentEntry = { closed: boolean; done: boolean; due: unknown; title?: string | null };

/** 0 needs doing, 1 handed in or finished and not closed, 2 closed. A closed item is closed even if it was tried. */
export function assessmentGroup(entry: Pick<AssessmentEntry, "closed" | "done">): 0 | 1 | 2 {
  if (entry.closed) return 2;
  return entry.done ? 1 : 0;
}

export const ASSESSMENT_GROUP_TITLES = ["To do", "Handed in", "Closed"] as const;

const dueTime = (due: unknown) => {
  const time = typeof due === "string" || due instanceof Date ? new Date(due).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
};

/** What needs doing first: to do (soonest deadline first, no deadline last), then handed in, then closed (latest first). */
export function sortAssessments<T extends AssessmentEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const groups = assessmentGroup(a) - assessmentGroup(b);
    if (groups !== 0) return groups;
    const left = dueTime(a.due);
    const right = dueTime(b.due);
    if (left === null && right === null) return String(a.title ?? "").localeCompare(String(b.title ?? ""));
    if (left === null) return 1;
    if (right === null) return -1;
    return assessmentGroup(a) === 0 ? left - right : right - left;
  });
}

/** One bar per course for the progress chart: its name and percent (0 to 100). */
export function courseProgressRows(courses: ReadonlyArray<{ name: string; pct: number }>) {
  return courses.map((course) => ({ name: course.name, percent: Math.max(0, Math.min(100, Math.round(Number(course.pct) || 0))) }));
}
