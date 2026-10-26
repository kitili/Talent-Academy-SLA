import { MODULE_QUIZ_PASS_PERCENT } from "./constants";

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
    body: "People who asked for a desk from the sign-in page. Approve a trainer or a Fellow, and they create their own password. If someone is waiting, Needs attention on this desk opens the same page.",
    target: "admin-nav-approvals",
  },
  {
    title: "People",
    body: "Trainers and Fellows share this one tab. Switch between them at the top. Create a trainer or a Fellow account, already approved, and open a name to see that account. A trainer cannot create another trainer.",
    target: "admin-nav-people",
  },
  {
    title: "Attendance",
    body: "The attendance list for Fellows and for trainers. You can mark who was present, late, absent, or excused.",
    target: "admin-nav-attendance",
  },
  {
    title: "Cohorts",
    body: "A cohort is a group of Fellows. A step is one stage inside that cohort, and each cohort can have a different number. Courses are the lessons on a step, placed here rather than on their own tab. Steps set the order: a course opens when the course before it is complete. A cohort can hold more than one trainer. You add the steps, place the courses, assign the trainers, and open or close the cohort and its quizzes.",
    target: "admin-nav-cohorts",
  },
  {
    title: "Analytics",
    body: "The gradebook for the whole academy: Fellows, open cohorts, completion, attendance, quizzes, reflections, course ratings, and who is at risk.",
    target: "admin-nav-analytics",
  },
  {
    title: "Courses",
    body: "Courses are the curriculum trainers teach, and only an admin adds, renames or deletes one. Open Cohorts, choose a step, and place the course there. Keep a course on draft while you edit it, and publish it when Fellows should see it.",
    target: "admin-nav-cohorts",
  },
  {
    title: "Counts",
    body: "Trainers, Fellows, and courses on the academy right now. Needs attention appears here when someone is waiting, and it opens Approvals.",
    target: "admin-stats",
  },
  {
    title: "Pictures",
    body: "Each picture opens the same place as its name in the side menu: Approvals, People, Cohorts, Attendance, Analytics, and Certificates.",
    target: "admin-pictures",
  },
  {
    title: "Academy notice",
    body: "Sends one note to every approved trainer and every approved Fellow. It lands in their bell. They do not reply inside the note.",
    target: "admin-notice",
  },
  {
    title: "Reset password",
    body: "Type a username or email and a new password for that account. Passwords are stored hashed, so the old one cannot be shown. You set a new one.",
    target: "admin-password",
  },
  {
    title: "Start fresh",
    body: "Clears only the areas you tick: cohorts, progress, quizzes, certificates, or notices. Pick the trainers or Fellows it applies to. Courses and login accounts stay. Type CLEAR ACTIVITY only when you mean it.",
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
    body: "Desk is the home, with the counts. Then Cohorts, Assessments & quizzes, Progress, Attendance, Messages, and Schedule. Open a cohort to see its Fellows on Progress.",
    target: "trainer-tools",
  },
  {
    title: "What stays with admin",
    body: "You can approve a new Fellow and reset that Fellow's password. You edit the modules, lesson files and quizzes of the courses on your cohorts. You cannot add or delete a course, add a cohort or a step, create an admin, clear the academy, or open another trainer's cohort.",
  },
];

export const TEACHER_TOUR: TourStep[] = [
  {
    title: "Fellow desk",
    body: "This is your learning home. The tour walks the places you use after you sign in on the Fellow tab.",
  },
  {
    title: "Continue learning",
    body: `Resume opens the next unlocked module. Read the lesson, then take its quiz, which you pass at ${MODULE_QUIZ_PASS_PERCENT}%. A lesson with no approved quiz is done once you mark it read. The following module stays locked until this one is done.`,
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
    body: "Open Certificates to see the certificates an admin has issued to you. An admin issues one after you finish every module of a course. Notices and desk mail, when your trainer writes, appear near the top of this page.",
    target: "teacher-certificates",
  },
];
