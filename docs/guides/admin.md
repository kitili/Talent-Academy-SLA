# Admin guide

Sign in on the Admin tab.

1. Create users (admin, trainer, or teacher) and approve pending accounts.
2. Create courses. Set **draft** while you are still editing. Set **published** when teachers should see it.
3. Add modules (weeks) with a competency focus, objectives, and lesson files or lesson text.
4. Approve a quiz, or leave the Classroom Practice quizzes which are already approved.
5. Certificates, analytics, and CSV exports use the same completion status as the teacher dashboard.
6. The first visit opens a short tour. **Tour** in the header replays it.
7. **Start fresh** clears courses, cohorts, progress, quizzes, certificates, and messages. Login accounts stay. Passwords are hashed and are not shown. Type `CLEAR ACTIVITY` to confirm.
8. Environment: set `NEON_DATABASE_URL` or `DATABASE_URL` to the one Postgres project, plus `SESSION_SECRET`. Do not commit those values.

Phase 2, not in this release: SSO, SMS, offline downloads, and AI course authoring.
