import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const databaseUrl =
  process.env.NEON_DATABASE_URL ||
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

export function getDatabaseUrl() {
  return databaseUrl;
}

export async function ensureWrittenAssignmentTables() {
  if (!databaseUrl) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS written_assignments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      title varchar NOT NULL,
      instructions text NOT NULL,
      due_date timestamp,
      created_by varchar REFERENCES users(id),
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      assignment_id varchar NOT NULL REFERENCES written_assignments(id) ON DELETE CASCADE,
      teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      response text NOT NULL,
      submitted_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_submission_unique
      ON assignment_submissions(assignment_id, teacher_id);
  `);
}
