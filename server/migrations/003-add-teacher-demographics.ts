import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Migration: Add demographic fields to teachers table
 *
 * Adds gender, location, qualification, employment_status, years_of_experience,
 * and date_of_birth columns to the teachers table for analytics and reporting.
 *
 * Run: npx tsx server/migrations/003-add-teacher-demographics.ts
 * Rollback: npx tsx server/migrations/003-add-teacher-demographics.ts rollback
 */

async function runMigration() {
  console.log("Starting migration: Add Teacher Demographics...\n");

  try {
    console.log("Adding demographic columns to teachers table...");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS gender VARCHAR`);
    console.log("  ✓ gender");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS location VARCHAR`);
    console.log("  ✓ location");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS qualification VARCHAR`);
    console.log("  ✓ qualification");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS employment_status VARCHAR`);
    console.log("  ✓ employment_status");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS years_of_experience INTEGER`);
    console.log("  ✓ years_of_experience");

    await db.execute(sql`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS date_of_birth TIMESTAMP`);
    console.log("  ✓ date_of_birth");

    console.log("\n✓ Migration completed successfully!");
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  }
}

async function rollbackMigration() {
  console.log("Starting rollback: Remove Teacher Demographics...\n");

  try {
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS gender`);
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS location`);
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS qualification`);
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS employment_status`);
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS years_of_experience`);
    await db.execute(sql`ALTER TABLE teachers DROP COLUMN IF EXISTS date_of_birth`);

    console.log("✓ Rollback completed successfully!");
  } catch (error) {
    console.error("\n✗ Rollback failed:", error);
    process.exit(1);
  }
}

const isRollback = process.argv.includes("rollback");
const operation = isRollback ? rollbackMigration() : runMigration();

operation
  .then(() => {
    console.log("Migration script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });

export { runMigration, rollbackMigration };
