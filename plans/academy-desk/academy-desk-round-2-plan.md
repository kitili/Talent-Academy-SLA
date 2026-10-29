# Academy desk round 2 Plan

## Status

**Approved — 2026-10-29.** Branch `feat/academy-desk-2`, cut from `feat/academy-desk` at `df57a31` so the round-1 PR stays as it is. Not started.

Decisions taken by the steering engineer (kitili) on 2026-10-29:
- Google Meet: the Trainer pastes a link; the app shows a **Live now · Join** button. No Google API.
- Courses: **Admin and every Trainer** can create a course (today Admin only).
- Deadlines: once a deadline passes the work **disappears** from the Fellow's lists and answers are refused.
  Trainers and Admin still see it and its submissions.
- Ship order: round 1 (`f7a087b`, `a78a239`, `df57a31`, which includes the sign-in fix) goes to `main` in its own PR first.
  This round follows on its own branch and PR.

## Objective

The user's request, 2026-10-29: Trainers register Fellows and review assessments; the names an assessment is shared with
should appear ("right now it doesn't appear"); deadlines show to Fellows and work vanishes after them; approved people
can sign in; scheduled sessions are run by the Trainer, seen by Fellows, and also editable by the Admin; the academy year
is edited by the Admin and shown to Trainers and Fellows only after **Done**; the KPI dashboard is missing things; and
instructional Trainers run live sessions, upload videos, share Google Meets and upload courses.

Round 1 already covers sign-in, Trainer-registered Fellows, kinds, the timetable and the academy year
(`docs/academy-desk/README.md`), but none of it is on `main`, so the live site shows none of it.

## Baseline Findings (read-only audit, 2026-10-29)

**Sharing names.** The audience is stored (`written_assignment_teachers`, `assigned_quiz_teachers`). The list routes,
however, return only `teacherIds` (`server/routes.ts:2913-2925`, `6043`; `server/storage.ts:1402-1413`, `3403-3406`).
- The Trainer exam list shows "N Fellows" (`client/src/pages/trainer-batches.tsx:1520`).
- The Assessments list shows no audience (`trainer-batches.tsx:235-268`), and neither does the Admin's quiz list
  (`admin-batches.tsx:675-694`).
- The cohort room's assessment form sends no `teacherIds` (`cohort-workspace.tsx:196-209`), so it always gives work to
  the whole cohort.

**Review.** Marking happens only in the cohort room (`cohort-workspace.tsx:645-712`). The Assessments page has no link to
it. **Security:** `GET`/`PATCH /api/batches/:b/assignments/:a/submissions` (`routes.ts:6115`, `6126`) never check that
the assignment belongs to `:b`, so a Trainer of cohort A can read or mark cohort B's work.

**Deadlines.** `assigned_quizzes.due_date` and `written_assignments.due_date` exist and Trainers set them; Fellows see
"due …" (`teacher-dashboard.tsx:1049`, `1058`, `1202`). Nothing enforces them. Every place that needs the rule:
- server: `routes.ts:3103`, `3117`, `3138`, `6206`, `6215`, and `storage.ts:1377` (also used for visibility at 3124 and
  3147) and `3453`;
- client: `teacher-dashboard.tsx` (to-do 710-713, Work ~1036, Exams ~1179) and `teacher-exam.tsx`.

**Sessions.** There are create, list and delete routes (`routes.ts:6235`, `6277`, `6291`) but **no update route** and
no storage update method. The Calendar timetable is read-only for everyone (`academy-calendar.tsx:88-152`). The Fellow's
Home shows title and time only (`teacher-dashboard.tsx:838-842`), although `/api/teacher/events` sends the links.

**Academy year.** There is no draft state (`shared/schema.ts:932-943`). `GET /api/academy-calendar` returns every row to
everyone (`server/academyDesk.ts:157-165`).

**Instructional Trainers.** The only rule that uses `trainer_type` is `canRunOnlineSessions`
(`shared/academyPeople.ts:53-57`).
- `POST`/`PATCH /api/courses` are `isAdmin` (`routes.ts:4255`, `4275`), and so is placing a course on a cohort
  (`academyPathRoutes.ts:264`).
- Trainers can add modules and files to courses they teach (`server/scope.ts:93`).
- The Trainer menu has no Courses item (`client/src/components/deskMenu.ts`).
- **Uploads pass through the Vercel function:** `PUT /api/local-objects/:id` (`routes.ts:1257`), then `put()`
  (`server/objectStorage.ts:84`). Reads also stream through the function (`readLocalObject`). Vercel caps function
  request and response bodies at about 4.5 MB, so videos cannot be uploaded or played on the live site. This applies to
  any file over that size, not only videos.

**KPIs** (`admin-home.tsx`, `admin-analytics.tsx`, the Trainer "This term" strip at `trainer-batches.tsx:1277-1289`):
- "Participation · last 30 days" has no 30-day window, and its numerator includes unapproved Fellows
  (`storage.ts:2330-2335`).
- "Fellows enrolled" counts approved Fellows, not enrolled ones (`storage.ts:2304`).
- A cohort with no rows counts as 0% and "at risk" (`storage.ts:2468`, `2491`).
- "Completion Rate Trends" plots a count (`storage.ts:2579`).
- The Trainer "Assessments" tile counts paper exams only.
- `upcomingEvents`, `certificateCount` and `cohortCount` are sent but never shown.
- No KPI covers Fellow or Trainer kinds, sessions, or assessment submissions.

## Scope

In scope: items A–F below. Out of scope:
- per-session attendance (`tasks/prioritised/mark-attendance-per-session.md`);
- the Steps column and other rows in `tasks/unprioritised/send-the-data-the-redesigned-pages-show.md`;
- creating Meet links through Google;
- email to registered Fellows.

## Desired Behavior and Key Changes

**A. Assessment audience and review**
1. The list routes for quizzes, exams and assessments return `audience: [{ teacherId, name }]` next to `teacherIds`.
2. The Trainer Assessments list, the exam list, the cohort room and the Admin quiz list print "Given to: names" or
   "Whole cohort".
3. The cohort room's assessment form gets the same "Who sits this" picker.
4. The marking view lists every Fellow in the audience with their state (submitted at, marked, not submitted) and keeps
   line breaks in answers.
5. Each assessment row on the Trainer Assessments page gets a **Mark submissions** link to the cohort room tab.
6. The submission routes refuse an assignment from another cohort (404).
7. The assessment deadline-change notice goes to the audience, not the whole cohort.

**B. Deadlines**
- One shared rule, `isPastDue(dueDate, now)` in `shared/` (null means never due). It is applied:
  - in `getAssignedQuizzesForTeacher` and the Fellow assignments query, so the work drops off every list;
  - on the open and submit routes, which answer 410 "The deadline has passed";
  - in the client, which refuses to show the work if the clock passes the deadline while the page is open.
- Staff routes are untouched.
- Overdue counts use the audience, not the whole cohort.

**C. Scheduled sessions**
- `PATCH /api/events/:id`, with the same guards as create (staff of the cohort; links only for instructional Trainers
  and Admin), and `storage.updateScheduledEvent`.
- Calendar → Timetable gets **Schedule a session**, **Edit** and **Remove** for Trainers (their cohorts) and Admin
  (all). It reuses the Trainer Schedule dialog fields, moved into a shared component.
- Fellows:
  - Home lists upcoming sessions with their links;
  - between 15 minutes before the start and the end, a session shows **Live now · Join** (meeting link);
  - after the end, **Watch the recording** if a video link is set.

**D. Academy year Done**
- Add a `published_at` column (nullable). New rows start as drafts.
- `POST /api/admin/academy-calendar/publish` publishes every draft.
- The read route gives non-Admins published rows only. The Admin sees **Draft** chips and a **Done — show to
  Trainers and Fellows** button.
- Editing a published row keeps it published.
- Existing rows are published when the column is added, so nothing visible today disappears.

**E. Courses and uploads for Trainers**
- `POST`/`PATCH /api/courses` move from `isAdmin` to `isTrainer`. A Trainer may edit only a course they created or one
  on a cohort they teach (`trainerMayEditCourse`). Deleting stays Admin only.
- A Trainer may place a course they created on a cohort they teach.
- The Trainer menu gains **Courses**.
- Uploads go **directly from the browser to Vercel Blob** using `@vercel/blob/client` `upload()` with a `handleUpload`
  route (`POST /api/blob-upload`, `isTrainer`, content types limited to documents, images, audio and video, up to
  500 MB).
  - The stored URL is the Blob URL, played directly by `<video>`.
  - Local development keeps the current path.
  - Existing `/api/local-objects/:id` files keep working, but they are read through the function as now; large
    old files are still affected.

**F. KPIs**
- Fix:
  - the participation window: Fellows with any progress, quiz or submission in the last 30 days, divided by approved
    Fellows;
  - "Fellows enrolled" (approved Fellows on at least one cohort);
  - empty cohorts (excluded from the average and from "at risk", shown as "No data yet");
  - the trend label ("Completions per month");
  - the Trainer Assessments tile (paper exams plus uploaded assessments).
- Add:
  - Admin Home:
    - Fellows split in-house and pre-service;
    - Trainers split in-house and instructional;
    - sessions this week (online / in person);
    - assessments with submissions waiting to be marked.
  - Trainer strip: upcoming sessions and submissions to mark.

## Design Decisions

- **D1.** Deadlines are hidden on the server, not only in the UI. A client-only filter would still let an answer through
  after the deadline. Rejected: a status job that closes work at the deadline (it needs a scheduler; computing it on read
  is enough).
- **D2.** Audience names are joined in the existing list queries. Rejected: a second "audience" request per row.
- **D3.** Publishing is all-at-once (`published_at` on every draft). Rejected: per-row publish (the request is "press
  done").
- **D4.** Browser-direct Blob upload. Rejected: raising the Express limit (Vercel's 4.5 MB cap is the platform's, not
  ours) and chunking through the function.
- **D5.** "Live now" is computed on the client from start and end. No status column.

## Simplest Design And What Was Cut

New things and their reasons:
- the `academy_calendar.published_at` column (the only way to hold a draft);
- the `/api/blob-upload` route (Vercel's body cap leaves no other way to get a video in);
- the shared `isPastDue` helper (one rule, used in two layers);
- a shared session-form component (the same dialog now lives on two pages).

Cut:
- Google Calendar and Meet integration;
- per-row publish;
- notifications on publish;
- video transcoding;
- moving old uploads to Blob URLs.

## Task Boundaries

The tasks share `server/routes.ts`, `server/storage.ts`, `client/src/pages/trainer-batches.tsx` and
`teacher-dashboard.tsx`, so they run **in sequence** in this checkout, one commit each, in this order: A, B, C, D, E, F.

**Phase 0** (no code): confirm that the live Vercel project has `BLOB_READ_WRITE_TOKEN`. `handleUpload` needs a
read-write token; OIDC `BLOB_STORE_ID` alone may not issue client tokens. If the token is missing, the user adds it
before E ships.

## Data Boundary And Security

- A: closes the cross-cohort submission read and mark.
- B: narrows what Fellows can open.
- E widens course writes to Trainers, bounded by course ownership or cohort teaching. Delete stays Admin. Blob upload
  tokens are issued only to signed-in Trainers, with type and size limits.
- The academy year hides drafts from non-Admins.

## Test Plan

Tests go under `tests/unit/academy-desk/` (route and contract tests in the style of `routes-contract.test.ts`):
- audience names in the list responses;
- a cross-cohort submission is refused;
- `isPastDue`, and that past-due work is absent from Fellow lists and refused on open and submit;
- session PATCH guards (a Trainer outside the cohort is refused; links need an instructional Trainer);
- drafts are hidden from a Trainer and a Fellow, shown after publish;
- a Trainer can create a course and cannot edit a course outside their cohorts or delete one;
- the KPI queries on fixed rows.

Then:
- `npm run typecheck` (29 errors already on `main`; no new ones);
- `npm run test:needed`, then the suite it names;
- `scripts/workflow-walkthrough.ts`, extended, run against a throwaway Neon project only — never the database in
  `.env.local`.

## Documentation Plan

- Update `docs/academy-desk/README.md` (move the items it lists under Not built that this round builds), `test-suite.md`,
  `workflow-walkthrough.md`, and `docs/guides/trainer.md` and `learner.md`.
- Add a learnings entry on the Vercel body cap for uploads.
