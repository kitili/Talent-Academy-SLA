import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db, pool } from "./db";
import { resolveDatabaseUrl } from "./databaseUrl";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

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
    // Check if admin user exists
    const adminEmail = "admin@silverleaf.com";
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);
    
    if (existingAdmin.length > 0) {
      console.log("✅ Admin user already exists — leaving password unchanged");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Username: ${existingAdmin[0].username}`);
      console.log(`   Role: ${existingAdmin[0].role}`);
    } else {
      // Create admin user
      console.log("📝 Creating admin user...");
      const hashedPassword = await hashPassword("admin123");
      
      await db.insert(users).values({
        username: "admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        approvalStatus: "approved",
        firstName: "Admin",
        lastName: "User",
      });
      
      console.log("✅ Admin user created successfully!");
      console.log(`   Username: admin`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: admin123`);
      console.log(`   Role: admin`);
    }
    
    // Verify admin user
    const verifyAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);
    
    if (verifyAdmin.length > 0 && verifyAdmin[0].role === "admin") {
      console.log("✅ Database initialization complete!");
      console.log("\n📌 Admin credentials:");
      console.log("   Username: admin");
      console.log("   Email: admin@silverleaf.com");
      console.log("   Password: admin123");
    } else {
      throw new Error("Admin user verification failed!");
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
