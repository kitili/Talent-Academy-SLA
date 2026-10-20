/** How this academy trains Tanzanian teachers, not the pupils themselves. */

export const LESSON_STAGES = [
  "Introduction",
  "Competence development",
  "Design",
  "Realisation",
] as const;

export type TrainingTrack = "primary" | "secondary";

export type LearningStage = {
  id: string;
  courseId: string;
  track: TrainingTrack;
  label: string;
  method: string;
  course: string;
  summary: string;
  modules: Array<{ focus: string; objective: string }>;
};

const tie = "Use the government lesson shape: Introduction, Competence development, Design, Realisation.";

export const LEARNING_STAGES: LearningStage[] = [
  {
    id: "playgroup",
    courseId: "a1111111-1111-4111-8111-000000000001",
    track: "primary",
    label: "Playgroup",
    method: "Montessori",
    course: "Playgroup — Montessori",
    summary: "Hands-on Montessori for the youngest class: practical life, sensorial, language, number, and culture.",
    modules: [
      { focus: "Practical life", objective: "Prepare pouring, dressing, and care of the room so a child can work alone." },
      { focus: "Sensorial", objective: "Use colour, shape, sound, and size so a child can sort the world." },
      { focus: "Language", objective: "Build spoken language and first sounds before formal reading." },
      { focus: "Mathematics", objective: "Move from counting real objects to the first number symbols." },
      { focus: "Culture", objective: "Introduce place, plants, animals, and care for the Tanzanian classroom." },
    ],
  },
  {
    id: "pre-primary",
    courseId: "a1111111-1111-4111-8111-000000000002",
    track: "primary",
    label: "Pre-primary",
    method: "Awali",
    course: "Pre-primary — Awali",
    summary: "Government pre-primary, still play-based, ready for Standard 1.",
    modules: [
      { focus: "What the child already knows", objective: `Start from the child's experience. ${tie}` },
      { focus: "Language and play", objective: "Grow speaking, songs, and first marks on paper." },
      { focus: "Early number", objective: "Count, match, and compare with objects in the room." },
      { focus: "Care of self and the room", objective: "Health, washing, and looking after the class environment." },
    ],
  },
  {
    id: "std-1-2",
    courseId: "a1111111-1111-4111-8111-000000000003",
    track: "primary",
    label: "Standard 1–2",
    method: "3Rs",
    course: "Standard 1–2 — Reading, writing, number",
    summary: "Kusoma, Kuandika, and Kuhesabu, plus health and culture, for the first two years.",
    modules: [
      { focus: "Kusoma", objective: "Teach letter sounds, then fluent reading. Include the Introduction stage." },
      { focus: "Kuandika", objective: "Teach letter formation and short writing. Move into Competence development." },
      { focus: "Kuhesabu", objective: "Teach number sense and the first operations with real objects." },
      { focus: "A full government lesson", objective: tie },
    ],
  },
  {
    id: "std-3-6",
    courseId: "a1111111-1111-4111-8111-000000000004",
    track: "primary",
    label: "Standard 3–6",
    method: "Subjects",
    course: "Standard 3–6 — Subjects",
    summary: "Kiswahili, English, Hisabati, science, and the wider primary subjects.",
    modules: [
      { focus: "Kiswahili", objective: "Teach speaking, reading, and writing in context." },
      { focus: "English", objective: "Teach listening, sounds, and short messages." },
      { focus: "Hisabati", objective: "Teach number work that pupils can use outside class." },
      { focus: "Sayansi na mazingira", objective: "Teach science and care of the environment from what pupils can observe." },
      { focus: "A full government lesson", objective: tie },
    ],
  },
  {
    id: "std-7",
    courseId: "a1111111-1111-4111-8111-000000000005",
    track: "primary",
    label: "Standard 7",
    method: "Primary leaving",
    course: "Standard 7 — Primary leaving",
    summary: "Revision and assessment for the last primary year.",
    modules: [
      { focus: "Revision across subjects", objective: "Help pupils retrieve Kiswahili, English, Hisabati, and science." },
      { focus: "Assessment", objective: "Use the Realisation stage: pupils show what they can do, and you record the gap." },
    ],
  },
  {
    id: "secondary",
    courseId: "a1111111-1111-4111-8111-000000000006",
    track: "secondary",
    label: "Secondary",
    method: "Form I",
    course: "Secondary — Form I",
    summary: "The secondary school is opening. This batch trains teachers for Form I.",
    modules: [
      { focus: "A secondary lesson", objective: "Keep the same four stages, with a longer subject period and older pupils." },
      { focus: "Form I subject teaching", objective: "Plan one Form I lesson in the subject you will teach. More subjects will be added as the school opens." },
    ],
  },
];

export const LEARNING_BATCHES = [
  { id: "49c90cb7-04d6-4402-b5b8-93a3ae5b6db9", stageId: "playgroup", trainerUsername: "trainer1", teacherEmails: ["teacher@test.com", "teacher2@test.com"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1002", stageId: "pre-primary", trainerUsername: "trainer2", teacherEmails: ["teacher3@test.com", "qa.teacher@silverleaf.academy"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1003", stageId: "std-1-2", trainerUsername: "trainer3", teacherEmails: ["teacher4@test.com"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1004", stageId: "std-3-6", trainerUsername: "trainer4", teacherEmails: ["teacher5@test.com"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1005", stageId: "std-7", trainerUsername: "trainer5", teacherEmails: ["teacher6@test.com"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1006", stageId: "secondary", trainerUsername: "trainer6", teacherEmails: ["teacher7@test.com"] },
  { id: "7c2a1f10-6b44-4c1e-9a11-0b5e2d3a1007", stageId: "secondary", trainerUsername: "test.trainer", teacherEmails: ["qa.teacher@silverleaf.academy"], name: "Secondary — Form I practice" },
] as const;

export const RETIRED_BATCH_NAMES = [
  "Batch 1",
  "Batch 1 — Classroom practice",
  "Batch 2 — Early years",
  "Batch 3 — Lower primary",
  "Batch 4 — Upper primary",
  "Batch 5 — Literacy",
  "Batch 6 — Numeracy",
  "Batch 7 — Staff practice",
];

export function stageById(id: string) {
  return LEARNING_STAGES.find((stage) => stage.id === id);
}

export function batchTitle(stageId: string) {
  const stage = stageById(stageId);
  return stage ? `${stage.label} — ${stage.method}` : stageId;
}

export function cohortName(batch: { stageId: string; name?: string }) {
  return batch.name || batchTitle(batch.stageId);
}
