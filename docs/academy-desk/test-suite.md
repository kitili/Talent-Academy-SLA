# Test suite: academy desk

| File | Covers |
| --- | --- |
| `tests/unit/academy-desk/people-and-calendar.test.ts` | The kinds, who may run online sessions, link checks, the access request carrying a kind, password trimming, calendar entry checks, month grouping. Pure rules from `shared/`. |
| `tests/unit/auth/approved-request-login.test.ts` | `pickApprovedStaff` and `pickApprovedTeacher` with real scrypt hashes: an approved desk opens, a desk with no password does not, every matching desk is tried, the right role wins. |
| `tests/unit/academy-desk/routes-contract.test.ts` | Text contracts: each rule is written in the route that enforces it (Trainer-only registration, Admin-only calendar writes, cohort ownership on sessions, audience on assessments, no password hash in rosters). Route handlers call `db` directly, so these cannot be driven without a database. |
| `tests/unit/contract/desk-menu.test.ts`, `tests/trainer-desk.test.ts` | The new menu items (Calendar, Fellows, Courses) and that the Trainer page draws only its own sections. |
| `tests/unit/academy-desk/assessment-audience.test.ts` | Audience names and the "Given to" label, the marking roster (submitted first, then those still to submit), the cross-cohort refusal on the submission routes, deadline notices to the audience only. |
| `tests/unit/academy-desk/deadlines.test.ts` | `isPastDue` and `fellowStillSees`, and that the Fellow list and answer routes apply them (410 after the deadline, review only for a Fellow who tried). |
| `tests/unit/academy-desk/sessions.test.ts` | When a session is live (`sessionPhase`), and the session edit route's guards and link rule. |
| `tests/unit/academy-desk/trainer-courses-and-uploads.test.ts` | `trainerMayEditCourse` with a course's maker, the Trainer course routes, Blob URL recognition, upload types and size, and that only a signed-in Trainer or Admin gets an upload signed. |
| `tests/unit/academy-desk/kpis.test.ts` | `countKinds`, the Trainer desk's assessment and to-mark counts, and the participation, enrolled and empty-cohort rules. |
| `tests/unit/cohorts/course-routes-admin-only.test.ts` | Deleting a course stays Admin only; editing one checks `trainerMayEditCourse` before it writes. |
| `scripts/workflow-walkthrough.ts` | Not part of `npm test`. Drives a running server on a throwaway database: 74 checks of the Admin, Trainer and Fellow flow and the refusals. See [workflow-walkthrough.md](workflow-walkthrough.md). |

The academy-year checks (drafts hidden until Done) are in `routes-contract.test.ts` and the walkthrough.

Run the unit files with `npx tsx --test tests/unit/academy-desk/*.test.ts tests/unit/auth/approved-request-login.test.ts`.
On Node 18 the kit runner (`scripts/run-node-tests.mjs`) cannot expand its globs; run the files with `tsx` as above.
