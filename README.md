# Talent-Academy-SLA

Silverleaf / Taleemabad Talent Academy LMS.

## What is production-ready

- **Neon Postgres** holds users, courses, quizzes, and progress (`NEON_DATABASE_URL` or `DATABASE_URL`).
- **Vercel Blob** holds uploaded slides when `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is set. Without it, uploads only last on this computer.
- **Sessions** live in the `sessions` table in Postgres, so login survives deploys.

## Local

Prefer the same Neon URI as production so passwords and teachers match the live site.

```bash
export NEON_DATABASE_URL="postgresql://..."
export SESSION_SECRET="change-me"
export PORT=8765
npm install
npm run db:push
npm run dev
```

Open http://127.0.0.1:8765

## Vercel

In **talent-academy-sla** set:

- `NEON_DATABASE_URL` or `DATABASE_URL` — Neon pooler URI with `sslmode=require`
- `SESSION_SECRET`
- Blob store connected to the project (OIDC `BLOB_STORE_ID`, or `BLOB_READ_WRITE_TOKEN`)

The site is https://talent-academy-sla.vercel.app

Test desks (not fellows): `admin` / `admin123`, `trainer1` / `trainer123`, `teacher@test.com` / `teacher123`.
