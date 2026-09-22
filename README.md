# Talent-Academy-SLA

Silverleaf / Taleemabad Talent Academy LMS.

## What is production-ready

- **Postgres** holds users, courses, quizzes, and progress. Use Neon (or any hosted Postgres) for Vercel. Local data stays in the machine Postgres until you restore it.
- **Vercel Blob** holds uploaded slides. Without `BLOB_READ_WRITE_TOKEN`, uploads only last on this computer.
- **Sessions** live in the `sessions` table in Postgres, so login survives deploys.

## Local

```bash
export DATABASE_URL="postgresql:///talent_academy?host=/var/run/postgresql"
export SESSION_SECRET="change-me"
export PORT=8765
npm install
npm run db:push
npm run dev
```

Open http://127.0.0.1:8765

## Vercel (durable data)

1. Create a Neon project and copy the **pooled** connection string.
2. In the Vercel project **talent-academy-sla** set:
   - `DATABASE_URL` — Neon URL (`sslmode=require`)
   - `SESSION_SECRET` — long random string
   - `BLOB_READ_WRITE_TOKEN` — from Vercel Storage → Blob
3. From this repo, apply schema and copy local data:

```bash
export DATABASE_URL="postgresql://..."
npm run db:push
bash scripts/restore-to-remote.sh
```

4. Redeploy. `GET /api/health` should return `"ok": true`.

The site is https://talent-academy-sla.vercel.app
