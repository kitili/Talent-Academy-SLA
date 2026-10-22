export type TourStep = {
  title: string;
  body: string;
  /** Matches a `data-tour` attribute on the page. Omitted steps stay centered. */
  target?: string;
};

export const ADMIN_TOUR: TourStep[] = [
  {
    title: "The top bar",
    body: "This bar stays on every admin page. The next steps name each control, then each name in the side menu.",
    target: "admin-header",
  },
  {
    title: "Academy mark",
    body: "Silverleaf Academy is the mark. The line under the name says this is the admin desk.",
    target: "admin-brand",
  },
  {
    title: "Signed-in account",
    body: "This is the admin account you signed in with. It stays in the bar so you can see which desk is open.",
    target: "admin-account",
  },
  {
    title: "Tour",
    body: "Tour starts this walk again from the first step. Use it any time you want the bar and the side menu explained.",
    target: "admin-tour",
  },
  {
    title: "Bell",
    body: "Opens notices sent to you. A red number means unread notes. An academy notice you send also arrives here.",
    target: "admin-bell",
  },
  {
    title: "Light and dark",
    body: "Switches the desk between a light page and a dark page. The choice stays on this browser.",
    target: "admin-theme",
  },
  {
    title: "Logout",
    body: "Signs this admin account out and returns you to the sign-in page.",
    target: "admin-logout",
  },
  {
    title: "The side menu",
    body: "These names stay down the left side of every admin page. Each one opens a different part of the academy. The next steps say what each name does.",
    target: "admin-nav",
  },
  {
    title: "Desk",
    body: "Desk brings you back to this home: the counts, the pictures, the academy notice, reset password, and start fresh.",
    target: "admin-nav-desk",
  },
  {
    title: "Approvals",
    body: "People who asked for a desk from the sign-in page. Sign a trainer or a teacher in, and they create their own password. If someone is waiting, Needs attention on this desk opens the same page.",
    target: "admin-nav-approvals",
  },
  {
    title: "People",
    body: "Trainers and teachers share this one tab. Switch between them at the top. Create a trainer or a teacher account, already approved, and open a name to see that account. A trainer cannot create another trainer.",
    target: "admin-nav-people",
  },
  {
    title: "Attendance",
    body: "The attendance list for teachers and for trainers. You can mark who was present, late, absent, or excused.",
    target: "admin-nav-attendance",
  },
  {
    title: "Cohorts",
    body: "A cohort is the group of teachers. A batch is a step inside that cohort, and each cohort can have a different number. Courses are the lessons on a batch, placed here rather than on their own tab. A batch can hold more than one teacher, and a cohort can hold more than one trainer. You add the batches, place the courses, assign the trainers, and open or close the cohort and its quizzes.",
    target: "admin-nav-cohorts",
  },
  {
    title: "Analytics",
    body: "The gradebook for the whole academy: teachers, open cohorts, completion, attendance, quizzes, reflections, course ratings, and who is at risk.",
    target: "admin-nav-analytics",
  },
  {
    title: "Courses",
    body: "Courses are the curriculum trainers teach. Open Cohorts, choose a batch, and place the course there. Keep a course on draft while you edit it, and publish it when teachers should see it.",
    target: "admin-nav-cohorts",
  },
  {
    title: "Counts",
    body: "Trainers, teachers, and courses on the academy right now. Needs attention appears here when someone is waiting, and it opens Approvals.",
    target: "admin-stats",
  },
  {
    title: "Pictures",
    body: "Each picture opens the same place as its name in the side menu: Approvals, People, Cohorts, Attendance, Analytics, and Certificates.",
    target: "admin-pictures",
  },
  {
    title: "Academy notice",
    body: "Sends one note to every approved trainer and every approved teacher. It lands in their bell. They do not reply inside the note.",
    target: "admin-notice",
  },
  {
    title: "Reset password",
    body: "Type a username or email and a new password for that account. Passwords are stored hashed, so the old one cannot be shown. You set a new one.",
    target: "admin-password",
  },
  {
    title: "Start fresh",
    body: "Clears only the areas you tick: cohorts, progress, quizzes, certificates, or notices. Pick the trainers or teachers it applies to. Courses and login accounts stay. Type CLEAR ACTIVITY only when you mean it.",
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
    body: "Open Cohorts in the side bar and pick a group. Another trainer's cohort stays off this list.",
    target: "trainer-batches",
  },
  {
    title: "The side bar",
    body: "Desk is the home, with the counts. Then Cohorts, Teachers, Assessments & quizzes, Progress, Attendance, Messages, and Schedule.",
    target: "trainer-tools",
  },
  {
    title: "What stays with admin",
    body: "You can approve a new teacher and reset that teacher's password. You cannot add a course, add a cohort or a batch, create an admin, clear the academy, or open another trainer's cohort.",
  },
];

export const TEACHER_TOUR: TourStep[] = [
  {
    title: "Teacher desk",
    body: "This is your learning home. The tour walks the places you use after you sign in on the Teacher tab.",
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
