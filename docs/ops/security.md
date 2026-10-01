# Security

- `security_violations` — quiz integrity events
- Row Level Security is enabled on `public` tables so the Supabase Data API (`anon` / `authenticated`) cannot read LMS rows. The Express app uses the Postgres connection string (bypasses RLS as table owner).
- Store only `SUPABASE_DATABASE_URL` / `DATABASE_URL` and `SESSION_SECRET` on the server. Do not put the `anon` key in the LMS frontend unless you add explicit policies.
