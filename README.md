# Talent-Academy-SLA

Silverleaf / Taleemabad Talent Academy LMS.

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

## Vercel

This app needs a Postgres `DATABASE_URL` and `SESSION_SECRET` in the Vercel project environment. File uploads persist only if object storage env vars are set; otherwise they use ephemeral local disk.

After the first deploy, run `npm run db:push` against that database (or apply the schema from a machine that has `DATABASE_URL` pointed at production).
