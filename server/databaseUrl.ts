const hostedHint =
  /supabase\.co|neon\.tech|sslmode=require|amazonaws\.com|pooler\.supabase/i;

export function resolveDatabaseUrl(): string {
  return (
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    ""
  );
}

export function isHostedPostgres(url: string): boolean {
  return hostedHint.test(url) || Boolean(process.env.VERCEL);
}
