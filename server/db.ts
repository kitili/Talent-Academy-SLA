import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL || "";
const hosted =
  !!process.env.VERCEL ||
  /neon\.tech|supabase\.co|sslmode=require|amazonaws\.com/.test(databaseUrl);

export const pool = new Pool({
  connectionString: databaseUrl || undefined,
  max: process.env.VERCEL ? 1 : 10,
  ssl: hosted ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle({ client: pool, schema });

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}
