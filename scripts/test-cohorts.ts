/**
 * Practice cohorts for the documented test desks.
 * The people enrolled here are teachers preparing for the classroom.
 * Passwords are the documented test passwords and are never printed.
 */
import { LEARNING_BATCHES, cohortName, stageById } from "../shared/tanzaniaPath";

export const TEST_COHORTS = LEARNING_BATCHES.map((batch) => {
  const stage = stageById(batch.stageId);
  if (!stage) throw new Error(`Missing stage ${batch.stageId}`);
  return {
    id: batch.id,
    name: cohortName(batch),
    description: stage.summary,
    stage: stage.id,
    track: stage.track,
    trainerUsername: batch.trainerUsername,
    teacherEmails: batch.teacherEmails,
  };
});

export const TEST_TEACHERS = [
  { email: "teacher@test.com", name: "Amina Teacher" },
] as const;
