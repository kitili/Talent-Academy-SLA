import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Migration: Add engagement tracking tables
 *
 * Creates tables for fellow reflections, disqualifications, satisfaction scores,
 * trainer comments, and course repetitions.
 *
 * Run: npx tsx server/migrations/004-add-engagement-tracking.ts
 * Rollback: npx tsx server/migrations/004-add-engagement-tracking.ts rollback
 */

async function runMigration() {
  console.log("Starting migration: Add Engagement Tracking Tables...\n");

  try {
    // 1. Fellow reflections table
    console.log("Creating fellow_reflections table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fellow_reflections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id VARCHAR NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        week_id VARCHAR NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
        batch_id VARCHAR NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        rating INTEGER,
        submitted_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fellow_reflection_unique
      ON fellow_reflections(teacher_id, week_id, batch_id)
    `);
    console.log("  ✓ fellow_reflections");

    // 2. Fellow disqualifications table
    console.log("Creating fellow_disqualifications table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fellow_disqualifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id VARCHAR NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        batch_id VARCHAR NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        disqualified_by VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        disqualified_by_role VARCHAR NOT NULL,
        disqualified_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_fellow_disqualification
      ON fellow_disqualifications(teacher_id, batch_id)
    `);
    console.log("  ✓ fellow_disqualifications");

    // 3. Satisfaction scores table
    console.log("Creating satisfaction_scores table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS satisfaction_scores (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR NOT NULL,
        rater_id VARCHAR NOT NULL,
        rater_role VARCHAR NOT NULL,
        target_id VARCHAR NOT NULL,
        target_type VARCHAR NOT NULL,
        batch_id VARCHAR REFERENCES batches(id) ON DELETE SET NULL,
        week_id VARCHAR REFERENCES training_weeks(id) ON DELETE SET NULL,
        score INTEGER NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_satisfaction_type_target
      ON satisfaction_scores(type, target_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_satisfaction_rater
      ON satisfaction_scores(rater_id)
    `);
    console.log("  ✓ satisfaction_scores");

    // 4. Trainer comments table
    console.log("Creating trainer_comments table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trainer_comments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        trainer_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        teacher_id VARCHAR NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        batch_id VARCHAR REFERENCES batches(id) ON DELETE SET NULL,
        week_id VARCHAR REFERENCES training_weeks(id) ON DELETE SET NULL,
        comment TEXT NOT NULL,
        category VARCHAR NOT NULL DEFAULT 'general',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_trainer_comments_teacher
      ON trainer_comments(teacher_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_trainer_comments_trainer
      ON trainer_comments(trainer_id)
    `);
    console.log("  ✓ trainer_comments");

    // 5. Course repetitions table
    console.log("Creating course_repetitions table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS course_repetitions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id VARCHAR NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        course_id VARCHAR NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        batch_id VARCHAR NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        repetition_number INTEGER NOT NULL DEFAULT 1,
        reason TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_course_repetitions
      ON course_repetitions(teacher_id, course_id)
    `);
    console.log("  ✓ course_repetitions");

    console.log("\n✓ Migration completed successfully!");
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  }
}

async function rollbackMigration() {
  console.log("Starting rollback: Remove Engagement Tracking Tables...\n");

  try {
    await db.execute(sql`DROP TABLE IF EXISTS course_repetitions CASCADE`);
    console.log("  ✓ Dropped course_repetitions");

    await db.execute(sql`DROP TABLE IF EXISTS trainer_comments CASCADE`);
    console.log("  ✓ Dropped trainer_comments");

    await db.execute(sql`DROP TABLE IF EXISTS satisfaction_scores CASCADE`);
    console.log("  ✓ Dropped satisfaction_scores");

    await db.execute(sql`DROP TABLE IF EXISTS fellow_disqualifications CASCADE`);
    console.log("  ✓ Dropped fellow_disqualifications");

    await db.execute(sql`DROP TABLE IF EXISTS fellow_reflections CASCADE`);
    console.log("  ✓ Dropped fellow_reflections");

    console.log("\n✓ Rollback completed successfully!");
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
