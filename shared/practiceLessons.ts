/** Short lessons a teacher can open without waiting for a cohort upload. */

export type PracticeLesson = {
  id: string;
  week: string;
  title: string;
  minutes: number;
  body: string;
};

export const PRACTICE_LESSONS: PracticeLesson[] = [
  {
    id: "week-1-observe",
    week: "Week One",
    title: "Watch before you teach",
    minutes: 6,
    body: "Sit where you can see the whole group. Notice who joins a game, who waits, and who needs a quieter start. Write one sentence about a child who found their own way in. That note is the lesson. It is not an assignment and it is not a quiz.",
  },
  {
    id: "week-2-circle",
    week: "Week Two",
    title: "Circle time",
    minutes: 8,
    body: "Gather the children in a circle. Say one short song, then pass a single object so each child has a turn to speak or to pass it on. Keep the circle short. End while they still want to stay. The material is the song and the object, not a worksheet.",
  },
  {
    id: "week-3-play",
    week: "Week Three",
    title: "Play is the lesson",
    minutes: 8,
    body: "Set out three choices: blocks, a picture book, and water or sand if you have it. Let the children choose. Your work is to name what you see: “You stacked three.” Do not turn the play into a test. The learning is in the doing.",
  },
];

export function practiceLesson(id: string) {
  return PRACTICE_LESSONS.find((lesson) => lesson.id === id);
}
