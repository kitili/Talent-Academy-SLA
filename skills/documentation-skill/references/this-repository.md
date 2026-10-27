# Documentation In This Repository

The project-specific half of `skills/documentation-skill/SKILL.md`: how `docs/` is laid out here today.

## Homes

| Home | Holds |
| --- | --- |
| `docs/architecture/` | Design and system views from before the kit: status, ERD, data flows, use cases, the role workflow, the gap requirements, the Supabase move. |
| `docs/guides/` | The handover guides for each role (admin, trainer, teacher) and how trainers and teachers talk. |
| `docs/ops/` | The operations areas (classroom, communications, identity, learning, marketing, onboarding, security). |
| `docs/_global/` | The cross-feature map (`README.md`) and repo-wide topics, such as `worker-performance/`. |
| `docs/_learnings/` | Transferable pitfalls, copied from the kit. Read them; never edit a copied one. |
| `docs/<feature>/` | None yet. Create one per feature when a feature is first documented, after confirming the home with the user. |

Root files: `README.md` (setup and deploy), `DEPLOYMENT.md` and `replit.md` (both describe the older Replit setup and
are stale), `design_guidelines.md`.

## Examples Of Larger Features

None documented as a feature folder yet. The first likely candidates, from the code:
- **Academy path**: cohorts, batches (steps), courses and their placement (`shared/academyPath.ts`,
  `server/academyPathRoutes.ts`, `client/src/pages/admin-batches.tsx`).
- **Teacher learning and quizzes**: module unlocks, quiz scoring, course completion (`server/progressLogic.ts`,
  `client/src/pages/teacher-dashboard.tsx`).
- **Certificates**: templates and issue (`shared/talentCertificate.ts`, `shared/certificateDesigns.ts`).
- **Attendance** (`shared/attendanceDesk.ts`, `client/src/pages/admin-attendance.tsx`).
- **Sign-in and access requests** (`server/auth.ts`, `shared/accessRequest.ts`).

## Conventions As Practised

- Docs are short and plain, written for the role that reads them; guides use tables for "control → what it does".
- No test reads `docs/` yet. `tests/unit/test-infrastructure/rulesFilesIdentical.test.ts` reads the four rules files,
  and many older tests read source files as text, so a source edit can fail a test that never imports it.
- The older docs mix shipped behaviour with plans. When touching one, label what is not shipped yet.
