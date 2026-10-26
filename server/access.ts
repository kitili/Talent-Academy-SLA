type Actor = { id?: string; role?: string | null } | null | undefined;
/** `trainerIds` are the cohort's `cohort_trainers` rows; `storage.getBatch` loads them. */
type BatchOwner = {
  trainerId?: string | null;
  trainerIds?: string[] | null;
} | null | undefined;

export function isAcademyStaff(user: Actor) {
  return user?.role === "admin" || user?.role === "trainer";
}

/**
 * Admins see every cohort. A trainer sees a cohort they are assigned to: a `cohort_trainers` row, or
 * `batches.trainer_id` (D8). `created_by` grants nothing. The SQL twin is `storage.getAllBatches(trainerId)`.
 */
export function trainerOwnsBatch(user: Actor, batch: BatchOwner) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "trainer" || !batch || !user.id) return false;
  return batch.trainerId === user.id || (batch.trainerIds || []).includes(user.id);
}
