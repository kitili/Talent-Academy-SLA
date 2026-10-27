# Skeleton Loaders Plan

## Status

**Asked for by the steering engineer (gich2009) on 2026-10-27:** "use skeleton loaders across the application so the
experience does not break the user's immersion", and "the topbar/navbar should be sticky … on all pages". Working
branch `feat/improvements-designs`.

The orchestrator commits the shared kit and the sticky shell first (see *Done before the tracks*). Then three tracks
(A, T, F) run in parallel, by the same file ownership as `plans/design-implementation/plan.md`.

**Built and merged, 2026-10-27.** Tracks A `df0d845`, T `dbf4c2d`, F `ea156b7`. Verify-pass fixes, the Trainer
Approvals shell, and `tests/unit/contract/loading-skeletons.test.ts` are in `7a42c7a`.
- **Verification:** `npm test` 107 + 170 pass; `npm run build` passes; typecheck 29, unchanged.
- **On screen, with every API answer slowed by 2 s:** sections show skeletons and then their content. The window never
  scrolls; only main does.

## Objective

While data loads, every page shows grey bars in the shape of what is coming. A page never shows:
- a spinner or "Loading…" text for content;
- an empty-state message ("No cohorts yet", "You are not in a cohort yet") before its data has answered;
- a blank area.

The shell's top bar and side menu stay in view on every page while the page scrolls.

## Done before the tracks (orchestrator)

- **`client/src/components/Skeletons.tsx`:** `SkeletonBar`, `Loading` (`role="status"`, `aria-busy`, a screen-reader
  label), `SkeletonCard`, `SkeletonRows`, `SkeletonFigures` (tiles, or `line` for the one-line figures summary),
  `SkeletonHeading`, and `PageSkeleton` (the shell in outline). The bars use `bg-sl-neutral-soft` and pulse only under
  `motion-safe`.
- **Before the app has loaded:** `client/index.html` paints the same page outline in plain HTML, instead of
  "opening sign in…".
- **Before the sign-in check answers:** `OpeningClassroom` (`lib/protected-route.tsx`, also used by `role-home`) draws
  `PageSkeleton`.
- **Existing skeletons:** `components/ui/skeleton.tsx` now uses the same grey and the reduced-motion rule.
- **Sticky shell:**
  - `html, body` use `overflow-x: clip`. Their old `hidden` made body a scroll box, so the sticky header scrolled away.
  - The header is a fixed height: 56px on a phone, 68px from 640px up.
  - The menu strip sticks under the header between 640px and 1023px. The side menu sticks under it from 1024px up,
    and scrolls on its own when it is taller than the window.
  - The phone bar stays fixed at the bottom.
  - **Amended the same day, at the steering engineer's request:** only the main content area scrolls. The shell is a
    fixed frame the height of the window. The header, the side menu (or the strip above the page) and the phone bar
    sit outside `<main>`, which is the only scroll container. The side menu scrolls on its own only when it is taller
    than the window. When printing, the frame is hidden and the page flows on paper.

## Rules for every track

1. **Content that loads from a query** shows a skeleton until the query has answered, in the layout of what it
   replaces:
   - the same card, with the same number of rows roughly;
   - the one-line figures summary for figures;
   - a table's header row kept, with skeleton rows under it.

   Use the kit, or `SkeletonBar` for a one-off shape. Never a spinner, never "Loading…" or "Opening…" text.
2. **Empty states wait for the answer.** An empty-state message shows only after the query answered with nothing.
   Check `isLoading` or `isPending` of that query, or `data === undefined`. Watch out for the
   `const { data = [] } = useQuery(...)` default, which turns "loading" into "empty".
3. **No flicker on refetch.** A background refetch (`isFetching` with data already there) keeps the data on screen.
   Skeletons are for the first load only.
4. **Actions in progress keep their button state.** A button whose mutation is running keeps its label ("Sending…",
   "Saving…") and is disabled. A small spinner icon inside a button may stay.
5. **Errors stay errors.** Keep every error message and retry.
6. **Every page sits in the shell** (`AcademyShell` with its desk), so the top bar and menu stay in view. Only the
   shell's `<main>` scrolls, so a page's own sticky bar sticks at `top-0` of it. Never call `window.scrollTo`: the shell
   resets the main area's scroll when the page or section changes.
7. Keep every `data-testid` and `data-tour`. Never start the server, and never load `.env` (the live database).

## Tracks

| Track | Model | Owns |
|---|---|---|
| A — Admin | Sonnet | `pages/admin-*.tsx`, `approvals.tsx`, `components/AdminParts.tsx`, `AttendanceBoard.tsx`, `BatchApprovalHistory.tsx`, `NotificationBell.tsx` |
| T — Trainer, cohort room, course editor | Sonnet | `pages/trainer-batches.tsx`, `cohort-workspace.tsx`, `course-weeks.tsx`, `course-view.tsx`, `trainer-teacher-content-history.tsx`, `components/TrainerMessages.tsx`, `FileQuizEditDialog.tsx`, `QuizDialog.tsx`, `QuizEditDialog.tsx`, `PresentationViewer.tsx`, `FilePreview.tsx` |
| F — Fellow | Sonnet | `pages/teacher-*.tsx`, `unified-auth.tsx`, `components/DeskMail.tsx`, `CohortMedals.tsx`, `FileQuizDialog.tsx`, `QuizRunner.tsx`, `DiscussionThread.tsx`, `ProfileSettingsDialog.tsx` |

Track T also puts `course-view.tsx` and `trainer-teacher-content-history.tsx` in `AcademyShell`. Today they render
with no top bar.
- **`course-view`:** the desk follows the role (admin, trainer, or a Fellow's `fellow`), with `current` "cohorts", or
  "learning" for a Fellow.
- **`trainer-teacher-content-history`:** `desk="trainer"`, `current="cohorts"`.

## Test Plan

- **Each track:** `npm run typecheck` (29 errors before the tracks; no new ones), the `tests/*.test.ts` files that read
  its files, and `node scripts/run-node-tests.mjs unit`.
- **The orchestrator:**
  - adds a contract test: no page or component renders "Loading…" / "Loading..." / "Opening…" as content text, and
    `OpeningClassroom` draws `PageSkeleton`;
  - after the merges, runs `npm test` and `npm run build`;
  - checks a slow first load and scrolling on each desk on screen.
