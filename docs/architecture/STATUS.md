# Where we are

Live app: https://talent-academy-sla.vercel.app  
Repo: `kitili/Talent-Academy-SLA`  
Database: **Neon** (`NEON_DATABASE_URL` / `DATABASE_URL`).

## Closed in this pack

Lesson-file Blob (OIDC or token), 1:1 desk mail, search on people/courses/cohorts, quiz pass mark, signed file grants, certificates via `/api/teacher/:id/certificates`, admin **Handover** for three weeks.

## Still a human step

Connect a Vercel Blob store to **talent-academy-sla** if health shows `blob: false` on production. Neon restore stays in the Neon console.

Test desks (not fellows): `admin` / `admin123`, `trainer1` / `trainer123`, `teacher@test.com` / `teacher123`.
