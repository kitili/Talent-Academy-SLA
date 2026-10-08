const hostedHint =
  /supabase\.co|neon\.tech|sslmode=require|amazonaws\.com|pooler\.supabase/i;

function usableDatabaseUrl(value?: string) {
  return Boolean(value && value.startsWith("postgres"));
}

export function resolveDatabaseUrl(): string {
  const candidates = [
    process.env.NEON_DATABASE_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ];
  return candidates.find(usableDatabaseUrl) || "";
}

export function isHostedPostgres(url: string): boolean {
  return hostedHint.test(url);
}
