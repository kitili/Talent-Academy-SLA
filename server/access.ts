type Actor = { id?: string; role?: string | null } | null | undefined;
type BatchOwner = {
  trainerId?: string | null;
  createdBy?: string | null;
  trainerIds?: string[] | null;
} | null | undefined;

export function isAcademyStaff(user: Actor) {
  return user?.role === "admin" || user?.role === "trainer";
}

/** Admins see every cohort. Trainers see cohorts they run or created. */
export function trainerOwnsBatch(user: Actor, batch: BatchOwner) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "trainer" || !batch) return false;
  return batch.trainerId === user.id || batch.createdBy === user.id || (batch.trainerIds || []).includes(user.id || "");
}
