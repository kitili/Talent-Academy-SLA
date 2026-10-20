/**
 * Practice cohorts for the documented test desks.
 * The people enrolled here are adult teachers preparing to teach young pupils.
 * Passwords are the documented test passwords and are never printed.
 */
export const TEST_COHORTS = [
  {
    id: "49c90cb7-04d6-4402-b5b8-93a3ae5b6db9",
    name: "Batch 1 — Classroom practice",
    description: "Adult teachers preparing to lead a class of young pupils.",
    trainerUsername: "trainer1",
    teacherEmails: ["teacher@test.com", "teacher2@test.com"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1002",
    name: "Batch 2 — Early years",
    description: "Adult teachers preparing for the youngest classes.",
    trainerUsername: "trainer2",
    teacherEmails: ["teacher3@test.com", "qa.teacher@silverleaf.academy"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1003",
    name: "Batch 3 — Lower primary",
    description: "Adult teachers preparing to teach lower primary pupils.",
    trainerUsername: "trainer3",
    teacherEmails: ["teacher4@test.com"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1004",
    name: "Batch 4 — Upper primary",
    description: "Adult teachers preparing to teach upper primary pupils.",
    trainerUsername: "trainer4",
    teacherEmails: ["teacher5@test.com"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1005",
    name: "Batch 5 — Literacy",
    description: "Adult teachers practising how to teach reading to young pupils.",
    trainerUsername: "trainer5",
    teacherEmails: ["teacher6@test.com"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1006",
    name: "Batch 6 — Numeracy",
    description: "Adult teachers practising how to teach number work to young pupils.",
    trainerUsername: "trainer6",
    teacherEmails: ["teacher7@test.com"],
  },
  {
    id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1007",
    name: "Batch 7 — Staff practice",
    description: "A practice batch for the extra test trainer.",
    trainerUsername: "test.trainer",
    teacherEmails: ["qa.teacher@silverleaf.academy"],
  },
] as const;

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
