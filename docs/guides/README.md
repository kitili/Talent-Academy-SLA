# Handover guides

- [Trainer walkthrough](trainer.md)
- [Fellow guide](learner.md)
- [How they talk](talking.md)
- [Admin](admin.md)

The words every guide uses: a **cohort** is a group of Fellows. A cohort has **steps**, a step holds **courses**, a course has **modules**, and a module has **lesson files**. A **Fellow** is a learner in the academy, and a **trainer** is the academy coach. A **session** is only a meeting on the calendar. Attendance is marked per day, as an **attendance mark** (present, late, absent or excused), and is never called a session. The code, the routes and the database keep the old names: a cohort is a `batches` row, a step is `cohort_batches`, a module is `training_weeks`, and a Fellow is a `teacher`. `shared/academyPath.ts` (`ACADEMY_TERMS`) holds the mapping.

What the guides promise, in one place: module quizzes pass at 80%; admins add, edit and delete courses (a new course is published at once); trainers edit the modules, lesson files and quizzes of the courses on their own cohorts and approve those quizzes; a lesson file with no approved quiz is done once the Fellow marks it read; a course is complete when every module is; certificates are issued by an admin and need that completion; and inactive desks stay folded and are not deleted at start-up. Anything not shipped is labelled "not shipped" where it appears.

Every desk (Admin, Trainer, Fellow) uses the same frame: a header with the logo, "Silverleaf Academy" and a pill that names the desk, a side menu down the left, and the page beside it. There are no pictures or scenery. The Admin guide (section B) describes it in full; the Trainer and Fellow guides name only what differs.

One database. Existing passwords are not reset by deploys.
