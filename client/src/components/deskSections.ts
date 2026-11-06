import { DESK_MENUS } from "./deskMenu";

/**
 * The sections the Trainer's page (`trainer-batches.tsx`) draws. A menu item belongs to it only when its link points at
 * that page: Fellows, Courses, Live sessions and Calendar are pages of their own, and a typed `?tab=` for one of them
 * must not pick a section the page has no renderer for.
 */
export type TrainerSection = "home" | "cohorts" | "assessments" | "progress" | "attendance" | "messages";

export const TRAINER_SECTION_KEYS = DESK_MENUS.trainer
  .filter((item) => item.href.startsWith("/trainer/batches"))
  .map((item) => item.key) as TrainerSection[];

/** The section a `?tab=` names. The old name for Home was "desk"; links that still carry it land on Home. */
export function trainerSectionFromSearch(search: string): TrainerSection {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "desk") return "home";
  return TRAINER_SECTION_KEYS.find((key) => key === tab) ?? "home";
}

/** Where an old `?tab=` now lives, or null when this page still draws it. The Schedule section moved to the Calendar. */
export function trainerTabRedirect(search: string): string | null {
  return new URLSearchParams(search).get("tab") === "schedule" ? "/calendar" : null;
}

/** The cohort room's tab for a `?tab=`. Quizzes and written work share one Assessments tab; old links to either land on it. */
export function cohortTabFromSearch(tab: string | null): string {
  if (tab === "quizzes" || tab === "work") return "assessments";
  return tab || "people";
}
