# Where we are

Live app: https://talent-academy-sla.vercel.app  
Repo: `kitili/Talent-Academy-SLA`  
Database today: **one Postgres** (still the Replit Neon host `ep-rough-math-afxbdrl2` until you paste a Supabase URI).  
Teachers on live: **11** (Hamna, William, Catherine, Paulo, Innocent, Juliana, Jofrey, Neema, Daniel, Test Teacher, Smoke Teacher).

## What we have done since we started

1. Took the existing Silverleaf LMS (not a rewrite) and made it run locally, then on Vercel.
2. Implemented the **Taleemabad feedback PDF** (5 items): completion not stuck as At Risk, quiz from slides plus manual questions, admin/teacher quiz sync, engagement by course not “0/5 weeks”, week 2 unlocks after week 1 + quiz.
3. LMS phrases, classroom UI, resume, learning statuses (Not Started / In Progress / Completed / Passed / Failed / Locked).
4. Stopped preferring Neon in code. Added a **Supabase pack**: all tables SQL, ops areas (identity, onboarding, learning, classroom, communications, marketing, security), Admin → Data catalog.
5. Fixed live: login spinner, blank dashboard after sign-in, missing teacher list, progress / files viewed / course completion on the list.
6. Test logins still work: `admin` / `admin123`, `trainer1` / `trainer123`, `teacher@test.com` / `teacher123`.

## What is not done yet

- You still need to **create the Supabase project**, run `supabase/migrations/0001` + `0002`, set `SUPABASE_DATABASE_URL`, remove Neon.
- Slides stay in **Vercel Blob** (token unset = uploads not durable).
- Week 2–3 handover extras (pass marks, file grants, etc.) are partly in code; not the original PDF.
- ERD / DFD / this workflow pack were missing; they are added next to this file.

## PDF vs system

| PDF | In the system |
|---|---|
| 1 Cohort completion + who finished, not At Risk | Admin analytics + course completion API |
| 2 Auto quiz from PPTX + manual questions | Generate quiz + admin quiz editor |
| 3 Quiz completion on admin and teacher dashboards | Report cards + batch progress |
| 4 Engagement by course, not 5-week assumption | Course completion %, named teachers |
| 5 Next week/course locked until previous + quiz | `applyModuleLocks` + assigned-weeks |
