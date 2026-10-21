/**
 * Practice cohorts for the documented test desks.
 * The people enrolled here are adult teachers preparing to teach young pupils.
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
  { email: "qa.teacher@silverleaf.academy", name: "QA Teacher" },
  { email: "teacher2@test.com", name: "Neema Teacher" },
  { email: "teacher3@test.com", name: "Joseph Teacher" },
  { email: "teacher4@test.com", name: "Grace Teacher" },
  { email: "teacher5@test.com", name: "Daniel Teacher" },
  { email: "teacher6@test.com", name: "Fatma Teacher" },
  { email: "teacher7@test.com", name: "Hassan Teacher" },
] as const;
