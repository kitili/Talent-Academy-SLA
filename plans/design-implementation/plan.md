# Design Implementation Plan

## Status

**Approved by the steering engineer (gich2009) on 2026-10-27: "add the branch and implement the designs … in tracks".**
Working branch `feat/improvements-designs`, cut from `feat/improvements` at `599ce2a`. Every track branches from this
branch's `HEAD` and merges back into it. `feat/improvements` takes it with the engineer's go-ahead; `main` is untouched.

Contract commit (this plan, `design/`, `client/src/components/deskMenu.ts`, the `AcademyShell` props, the `sl-*`
colour tokens): `09d9d07`.

**Built and merged, 2026-10-27.** All eight tracks merged into `feat/improvements-designs`: S `825d71a`, P `2e52135`,
A1 `0c66bab`, A2 `487513d`, T1 `1762a13`, T2 `4215160`, F1 `01f4727`, F2 `6954f52`.
- **Verify passes:** three read-only Sonnet passes covered the seven Sonnet tracks. Their findings were fixed by the
  orchestrator in `b0d4ecc`, `98d3b49` and `3406ffe`.
- **Screen check:** done with the test logins (Admin, Trainer, Fellow), in light and dark mode and at phone width. It
  found one false empty state on the Fellow desk, fixed in `d226d15`.
- **Verification:**
  - `npm test`: 107 and 167 pass, 0 fail;
  - `npm run build`: passes;
  - `npm run typecheck`: 29 errors, down from 32; none in a file the tracks changed.
- **Not built:** what the server does not send yet is listed in
  `tasks/unprioritised/send-the-data-the-redesigned-pages-show.md`.
- **Words outside the tracks:** the guided tour's words (`shared/guidedTour.ts`) and the guides were updated after
  the merge.

## Objective

Make every Admin, Trainer and Fellow screen look and read like the proposed boards in `design/board/` (the claude.ai
design board "Silverleaf LMS — Design Board", version 24): one shell, one accent colour, status colours only for status,
the glossary's words, work first and figures after.

## Scope

- In: the shared shell (header, side menu, phone menu), the colour tokens, and the page layout and copy of every
  screen listed under *Tracks*.
- Out:
  - **Server, schema and data:** no change to `server/`, `shared/` or `supabase/`, and no new API. Where a design needs
    data the server does not send, build the rest of the page, show nothing invented, and list the gap in the report.
  - **Set-your-password page and invites:** they belong to `plans/admin-invites/plan.md` (branch
    `claude/suspicious-sanderson-189f78`).
  - **Attendance per session:** it is task `tasks/prioritised/mark-attendance-per-session.md`.
  - **Docs and guides:** the orchestrator updates them after the merge.

## Shared contract (committed before any track starts; it wins over a track's own reading of a board)

1. **Menus:** `client/src/components/deskMenu.ts`. `DESK_MENUS[desk]` lists each desk's items in order, with `key`,
   `label`, `href` and `test`.
   - Trainer and Fellow items carry `?tab=<key>` hrefs. Their desk pages must read `?tab=` on load and keep it in step
     when the section changes.
   - Keys never change. Only the shell track may add fields.
2. **Shell props:** `AcademyShell` (`client/src/components/AcademyShell.tsx`) takes `desk`, `current` and
   `onNavigate(key)`.
   - With `onNavigate`, a menu click switches the section in place. Without it, the click follows `href`.
   - Admin pages get the shell through `AdminPage` / `showAdminNav`, which the shell track points at `desk="admin"`.
3. **Colours:** the `sl-*` Tailwind colours (`bg-sl-ground`, `bg-sl-surface`, `border-sl-line`, `border-sl-control`,
   `text-sl-ink`, `text-sl-muted`, `text-sl-accent`, `bg-sl-accent-strong`, `bg-sl-accent-soft`, `text-sl-risk`,
   `bg-sl-risk-soft`, `-attention`, `-done`, `-neutral` and their `-soft`).
   - They are defined in `client/src/index.css` with dark-mode values.
   - Use them instead of raw hex. The only exception is the certificate, which is already done.
   - Status colours mean status only:
     - **risk:** at risk or error;
     - **attention:** needs attention, and the viewer can fix it;
     - **done:** passed, done or open;
     - **neutral:** not yet, or out of the viewer's hands.
4. **Words:** `design/board/Glossary.dc.html` and `design/DESIGN-BRIEF.md` ("Words").
   - The learner is a **Fellow** on every screen.
   - **Session** means only a calendar meeting. Attendance names the day ("Mark attendance for today", "Recent marks").
   - Never "Week" for a module, "Batch" for a cohort, or "class roster".
5. **Looks:** `design/DESIGN-BRIEF.md` ("Look") for type sizes, radii and buttons. Example-state blocks on the boards
   are not built: they show a page in use. Build the real empty state the board shows above them.

## Rules for every track

- **Keep every behaviour.** Keep every query, mutation, dialog, form and action. Restyle, reorder and reword only.
  Remove something only where a board removes it deliberately, and list each removal in the report. The boards that do
  this are:
  - Admin Analytics' "Needs attention" block, replaced by a link to Home;
  - Trainer Schedule's always-open form, now opened by "Add a session";
  - Trainer Cohorts' "Open" chips, so only "Closed" shows;
  - Admin person detail and Admin Cohorts' destructive actions, which go into a "More actions" menu.
- **Keep test hooks.** Keep every `data-testid` and `data-tour` on the element that now does the same job.
- **Text-contract tests.** Tests in `tests/*.test.ts` match source text. Change an assertion only where a board
  deliberately changes that text, and list every assertion you changed.
- **No scenery.** Drop scenic backdrops, photos and decorative art (`PlaceArt`, `ModuleScene`, `ClassroomArt`) from
  the pages you own. Only the shell track edits those components.
- **Accessibility:** real buttons, links and labels; targets of at least 44px; `aria-current` on the current item.
- **Never start the server, and never load `.env`.** It is the live production database. Check pages by reading the
  boards, with `npm run typecheck` and the focused tests. The orchestrator checks the merged app on screen.

## Tracks (file ownership; nobody edits a file another track owns)

| Track | Model | Owns | Boards |
|---|---|---|---|
| S — Shell | Opus | `client/src/index.css`, `tailwind.config.ts`, `components/AcademyShell.tsx`, `AdminNav.tsx`, `AdminPage.tsx`, `SceneBackdrop.tsx`, `NotificationBell.tsx`, `MobileMenu.tsx`, `ThemeToggle.tsx`, `TeacherLearnerNav.tsx`, `GuidedTour.tsx`, `PlaceArt.tsx`, `ClassroomArt.tsx`, `DeskGraffiti.tsx`, `deskMenu.ts` (add only) | Shell, FellowPhone (the phone menu) |
| P — Sign-in | Sonnet | `pages/unified-auth.tsx` | SignInNew, RequestDesk |
| A1 — Admin people and cohorts | Sonnet | `pages/admin-home.tsx`, `approvals.tsx`, `admin-people.tsx`, `admin-trainers.tsx`, `admin-teachers.tsx`, `admin-trainer-detail.tsx`, `admin-teacher-detail.tsx`, `admin-batches.tsx`, `components/BatchApprovalHistory.tsx` | AdminHome, AdminApprovals, AdminPeople, AdminPersonDetail, AdminCohorts |
| A2 — Admin records | Sonnet | `pages/admin-attendance.tsx`, `admin-analytics.tsx`, `admin-certificates.tsx`, `components/AttendanceBoard.tsx` | AdminAttendance, AdminAnalytics, AdminCertificates, CertificateSamples |
| T1 — Trainer desk | Sonnet | `pages/trainer-batches.tsx`, `components/TrainerMessages.tsx` | TrainerHome, TrainerCohort, TrainerAssessments, TrainerProgress, TrainerAttendance, TrainerMessages, TrainerSchedule |
| T2 — Cohort room and course editor | Sonnet | `pages/cohort-workspace.tsx`, `course-weeks.tsx`, `course-view.tsx`, `components/FileQuizEditDialog.tsx`, `QuizDialog.tsx` | CohortRoom, CourseEditor |
| F1 — Fellow desk | Sonnet | `pages/teacher-dashboard.tsx`, `components/DeskMail.tsx`, `CohortMedals.tsx`, `ModuleScene.tsx` | FellowHome, FellowLearning, FellowWork, FellowQuizzes, FellowProgress, FellowReflect, FellowMessages, FellowStates |
| F2 — Fellow module, quiz and certificates | Sonnet | `pages/teacher-content-view.tsx`, `teacher-exam.tsx`, `teacher-certificates.tsx`, `teacher-certificate-view.tsx`, `components/FileQuizDialog.tsx`, `QuizRunner.tsx`, `DiscussionThread.tsx` | FellowModule, FellowQuiz, FellowStates (quiz screens), FellowCertificates |

**Shared components that change behind other pages.** These props APIs must keep working for every caller:
- `DeskMail`: `teacher-dashboard`, `TrainerMessages`.
- `CohortMedals`: `teacher-dashboard`, `trainer-batches`.
- `FileQuizDialog`: `course-view`, `teacher-content-view`.
- `FileQuizEditDialog`: `course-weeks`, `admin-analytics`.

`PageStrip`, `TableOfContents`, `SilverleafCertificate` and `components/ui/*` are not edited by any track.

All eight tracks start together. The contract is committed, so no track waits on another. The pages look fully right
only once S has merged; the orchestrator checks them on screen then.

## Test Plan

- Each track: `npm run typecheck` (the branch has 32 errors before any track; the count must not rise, and none may be
  in a file you own), the `tests/*.test.ts` files that read your files (`grep -l "<your file>" tests/*.ts`), and
  `node scripts/run-node-tests.mjs unit`.
- After all merges, the orchestrator runs:
  - `npm test` and `npm run build`;
  - a screen check of each desk in the local app with the test logins only (admin, trainer1, teacher@test.com), at
    1280px and at phone width, in light and dark mode.
- Each Sonnet track gets a separate verify pass before it merges: its diff is read against its boards and the rules
  above.

## Acceptance Criteria

- Every page in the *Tracks* table matches its board's layout, words and colours, in light and dark mode.
- No behaviour is lost (each removal is listed and comes from a board), and no test hook is lost.
- `npm test` passes, `npm run build` passes, and typecheck has no new errors.
