# Supabase workflow

Neon is already connected (`DATABASE_URL` / `NEON_DATABASE_URL` on Vercel). Supabase is the new home you create. One live database only.

```
You create Supabase project
        │
        ▼
SQL Editor: 0001_talent_academy.sql
        then 0002_ops_labels.sql / 0002_ops_views.sql
        │
        ▼
Copy Transaction pooler URI (port 6543)
        │
        ▼
Dump current Neon → restore into Supabase
        │
        ▼
Vercel: SUPABASE_DATABASE_URL = that URI
        delete NEON_DATABASE_URL
        │
        ▼
Redeploy · GET /api/health · host is *.supabase.co
        │
        ▼
Table Editor → schema ops → catalog
        (onboarding, marketing, learning, …)
```

**You:** create the project and paste the URI (do not put the password in git).  
**Repo:** SQL, ops catalog, `resolveDatabaseUrl()` already prefers `SUPABASE_DATABASE_URL`.  
**Copy data:** `scripts/restore-to-remote.sh` after `SUPABASE_DATABASE_URL` is set, using a dump of the current Neon DB.

Health today still shows `ep-rough-math-afxbdrl2` until that Vercel switch.
