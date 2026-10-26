import { storageScopeReaders, trainerCohortIds, type ScopeReaders } from "./scope";

/**
 * Cohort roster rules the admin routes share, kept apart from `db` so tests drive them with rows in memory.
 */

type Actor = { id?: string; role?: string | null } | null | undefined;

/**
 * The cohort enrolments (`batch_teachers` rows) an admin's step save adds (D9). A step save never removes
 * an enrolment: taking a Fellow out of the cohort is the explicit Remove on the roster. Only Fellows this
 * save newly ticks on the step are enrolled, so a save of an unrelated step, or of this step's existing
 * list, never undoes a Remove.
 */
export function enrolmentsToAdd({
  stepBefore,
  stepAfter,
  enrolled,
}: {
  /** The step's Fellows before the save (`cohort_batch_teachers`). */
  stepBefore: string[];
  /** The step's Fellows the save asks for. */
  stepAfter: string[];
  /** The cohort's enrolled Fellows now (`batch_teachers`). */
  enrolled: string[];
}): string[] {
  const before = new Set(stepBefore);
  const inCohort = new Set(enrolled);
  return Array.from(new Set(stepAfter)).filter((id) => !before.has(id) && !inCohort.has(id));
}

/** How many cohorts each trainer runs, by C4 (D8): a `cohort_trainers` row or `batches.trainer_id`. */
export async function trainerCohortCounts(
  trainerIds: string[],
  readers: ScopeReaders = storageScopeReaders,
): Promise<Record<string, number>> {
  const counts = await Promise.all(trainerIds.map((id) => trainerCohortIds(id, readers)));
  return Object.fromEntries(trainerIds.map((id, index) => [id, counts[index].length]));
}

/** The cohorts in the list the caller may see: an admin sees all, a trainer those C4 gives them, anyone else none. */
export async function cohortsInScope<T extends { id: string }>(
  user: Actor,
  cohorts: T[],
  readers: ScopeReaders = storageScopeReaders,
): Promise<T[]> {
  if (user?.role === "admin") return cohorts;
  if (user?.role !== "trainer" || !user.id) return [];
  const mine = new Set(await trainerCohortIds(user.id, readers));
  return cohorts.filter((cohort) => mine.has(cohort.id));
}
