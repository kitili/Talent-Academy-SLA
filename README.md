# Talent-Academy-SLA

Silverleaf / Taleemabad Talent Academy LMS.

## What is production-ready

- **Postgres** holds users, courses, quizzes, and progress. Use **one Supabase project** (`SUPABASE_DATABASE_URL` or `DATABASE_URL`). Schema and ops catalog: `docs/ops/README.md` and `supabase/migrations/0001_talent_academy.sql`.
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

1. Create a Supabase project, run `supabase/migrations/0001_talent_academy.sql`, copy the **transaction pooler** URI.
2. In the Vercel project **talent-academy-sla** set:
   - `SUPABASE_DATABASE_URL` (or `DATABASE_URL`) — pooler URI with `sslmode=require`
   - `SESSION_SECRET` — long random string
   - `BLOB_READ_WRITE_TOKEN` — from Vercel Storage → Blob
3. Remove `NEON_DATABASE_URL` from Vercel so the app does not keep using Neon.
4. From this repo, apply schema and copy existing data if needed:

```bash
export SUPABASE_DATABASE_URL="postgresql://..."
npm run db:push
bash scripts/restore-to-remote.sh
```

5. Redeploy. `GET /api/health` should return `"ok": true`.

The site is https://talent-academy-sla.vercel.app
