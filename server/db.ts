import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const hosted =
  !!process.env.VERCEL ||
  /neon\.tech|supabase\.co|sslmode=require|amazonaws\.com/.test(databaseUrl);

export const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        max: process.env.VERCEL ? 1 : 10,
        ssl: hosted ? { rejectUnauthorized: false } : undefined,
      }
    : {
        // Never implicitly connect to localhost:5432 on Vercel.
        connectionString: "postgres://127.0.0.1:1/unconfigured",
        max: 0,
      },
);

export const db = drizzle({ client: pool, schema });

export function hasDatabaseUrl() {
  return Boolean(databaseUrl);
}
