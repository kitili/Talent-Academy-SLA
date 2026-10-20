# Where we are

Live app: https://talent-academy-sla.vercel.app  
Repo: `kitili/Talent-Academy-SLA`  
Database: **Neon** (`NEON_DATABASE_URL` / `DATABASE_URL`).

## Closed in this pack

Lesson-file Blob (OIDC or token), 1:1 desk mail, search on people/courses/cohorts, quiz pass mark, signed file grants, certificates via `/api/teacher/:id/certificates`, admin **Handover** for three weeks.

## Still a human step

Production health should show `blob: true` (lesson files on Vercel Blob) and a Neon host. Mail and Google/Microsoft sign-in stay off until `RESEND_API_KEY` and the SSO client secrets are set in Vercel. Neon restore stays in the Neon console.

Test desks (not fellows): `admin` / `admin123`, `trainer1` / `trainer123`, `teacher@test.com` / `teacher123`.
