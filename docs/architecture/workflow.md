# Workflow — previous LMS + Taleemabad PDF

Same roles as before: **Admin**, **Trainer**, **Fellow** (the learner; the code and database still say `teacher`). One naming model: **cohort → step → course → module → lesson file → quiz**. The mapping to tables is in `shared/academyPath.ts` (`ACADEMY_TERMS`): a cohort is `batches`, a step is `cohort_batches`, a module is `training_weeks`, and lesson files are `deckFiles` inside a module.

```
Admin signs in
        │
        ▼
Create a course (Cohorts page, Courses card)   ← only an admin adds, edits, publishes or deletes a course
        │
        ▼
Add modules + upload lesson files              ← PDF 2; admin, or a trainer on a course placed on their cohort
        │
        ▼
Draft a quiz from the lesson file
   or type questions by hand                   ← PDF 2; every AI draft is saved unapproved
        │
        ▼
Approve the quiz                               ← admin (Analytics), or the trainer of that cohort
        │
        ▼
Place the course on a step of a cohort;
order the steps                                ← steps set the course order
        │
        ▼
Put Fellows on the steps (7100+ IDs)           ← a step save adds Fellows and never removes one
        │
        ▼
Fellow signs in → Learning
        │
        ▼
Module 1 open; module 2 locked
        │
        ▼
Read the lesson file → pass its quiz at 80%    ← a lesson file with no approved quiz is done once marked read
        │
        ▼
Module 2 unlocks; later modules the same       ← PDF 5
        │
        ▼
Every module complete → course complete
→ Mark complete and open the next course       ← the next course opens in step order
        │
        ▼
Admin issues the certificate by hand           ← needs the course complete; automatic issue is not shipped
        │
        ▼
Admin/trainer see the named Fellow,
% complete, not At Risk                        ← PDF 1 + 3 + 4
```

**Where to click in the current app**

| Step | Screen |
|---|---|
| Sign in | `/auth` |
| Admin desk | `/admin` |
| Trainers and Fellows, with progress | `/admin/people` (`/admin/trainers` and `/admin/teachers` open the same tab) |
| Approvals | `/approvals` |
| Cohorts, steps and courses | `/admin/batches` (the route keeps the old name), then a cohort room at `/cohorts/:batchId` |
| Analytics / engagement; quiz approval | `/admin/analytics` |
| Certificates | `/admin/certificates` |
| Attendance | `/admin/attendance` |
| Trainer desk | `/trainer/batches` |
| A course's modules and lesson files | `/courses/:courseId` |
| Fellow path | `/teacher/dashboard` → module content at `/teacher/week/:weekId/content` |
| Fellow certificates | `/teacher/certificates` |
| Database area catalog | No screen. The admin-only JSON is `GET /api/admin/ops-catalog`. |

**Passwords (test):** admin `admin123` · trainer1 `trainer123` · teacher@test.com `teacher123`.
