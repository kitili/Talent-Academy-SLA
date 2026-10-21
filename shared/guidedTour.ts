export type TourStep = {
  title: string;
  body: string;
  /** Matches a `data-tour` attribute on the page. Omitted steps stay centered. */
  target?: string;
};

export const ADMIN_TOUR: TourStep[] = [
  {
    title: "Admin desk",
    body: "This short tour shows where to move. You land here after signing in on the Admin tab. A short count line sits under the greeting. The pictures below open the rest of the academy.",
  },
  {
    title: "Counts",
    body: "Trainers, teachers, and courses. If someone is waiting, a Needs attention row appears and opens Approvals.",
    target: "admin-stats",
  },
  {
    title: "Where to go next",
    body: "The navbar opens Approvals, Trainers, Teachers, Cohorts, Analytics, and Courses. Approvals lets people in. Cohorts is one place to add cohorts, the batches inside them, and courses, and to open or close the class and its quizzes. Analytics is the gradebook. Courses is where you add modules and lesson files.",
    target: "admin-nav",
  },
  {
    title: "Passwords stay hidden",
    body: "Use Reset password on this desk when someone needs a new password. The academy stores passwords hashed, so it cannot show the current one. You set a new password; you do not read the old one.",
  },
  {
    title: "Start fresh",
    body: "Start fresh clears only the areas you tick: cohorts, progress, quizzes, certificates, or notices. Pick the people it applies to. It does not clear the whole academy, and login accounts stay. Type CLEAR ACTIVITY only when you mean it.",
    target: "admin-fresh",
  },
];

export const TRAINER_TOUR: TourStep[] = [
  {
    title: "Trainer desk",
    body: "This is your cohort home. Primary trainers cover playgroup to Standard 7. Secondary trainers cover Form I.",
  },
  {
    title: "Your cohorts",
    body: "Pick a batch on the left. These are adult teachers, not the pupils. Another trainer's batch stays off this list.",
    target: "trainer-batches",
  },
  {
    title: "Teachers, work, and documents",
    body: "Inside a cohort: Teachers, Quizzes, Progress, Attendance, Schedule, and Certificates. Add teachers, assign a quiz, and set written work. Courses in the header is where modules and lesson documents live.",
    target: "trainer-tools",
  },
  {
    title: "What stays with admin",
    body: "You can add a course, approve a new teacher, and reset that teacher's password. You cannot add a cohort or a batch, create an admin, clear the academy, or open another trainer's cohort.",
  },
];

export const TEACHER_TOUR: TourStep[] = [
  {
    title: "Teacher desk",
    body: "This is your learning home. You are an adult teacher preparing to teach young pupils. The tour walks the places you use after you sign in on the Teacher tab.",
  },
  {
    title: "Continue learning",
    body: "Resume opens the next unlocked module. Read the lesson, mark it read, then take the quiz. The following module stays locked until this one is passed.",
    target: "teacher-continue",
  },
  {
    title: "My learning",
    body: "Each assigned course shows a percent and a status: Not Started, In Progress, Completed, Passed, Failed, or Locked. Your trainer sees the same percentages.",
    target: "teacher-learning",
  },
  {
    title: "Your progress",
    body: "Level, quizzes, average score, attendance, modules, and reflections sit on the Progress tab. Calendar and written work are on the Work tab.",
    target: "teacher-progress",
  },
  {
    title: "Certificates",
    body: "Open Certificates when a course is complete. Notices and desk mail, when your trainer writes, appear near the top of this page.",
    target: "teacher-certificates",
  },
];
