import { db, pool } from "./db";
import { resolveDatabaseUrl } from "./databaseUrl";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { ensureAllTestLogins } from "./ensureTestLogins";

async function initializeDatabase() {
  console.log("🔧 Initializing database...");
  
  // Check database connection
  const dbUrl = resolveDatabaseUrl();
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set!");
  }
  
  // Log which database we're connected to (without exposing credentials)
  const isProduction = process.env.NODE_ENV === "production";
  console.log(`📊 Database environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`🔗 Database URL starts with: ${dbUrl.substring(0, 30)}...`);

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
      submitted_at timestamp DEFAULT now(),
      trainer_score integer,
      trainer_comment text,
      rubric jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_submission_unique
      ON assignment_submissions(assignment_id, teacher_id);
  `);
  console.log("✅ Written assignment tables are present");
  
  try {
    const adminEmail = "admin@silverleaf.com";
    await ensureAllTestLogins();
    const verifyAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (verifyAdmin.length > 0 && verifyAdmin[0].role === "admin" && verifyAdmin[0].username === "admin") {
      console.log("✅ Database initialization complete!");
      console.log("Test logins: admin / admin123, trainer1 / trainer123, teacher@test.com / teacher123");
    } else {
      throw new Error("Admin test login was not created");
    }
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}

// Run initialization
initializeDatabase()
  .then(() => {
    console.log("\n✨ Database is ready!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Initialization error:", error);
    process.exit(1);
  });
