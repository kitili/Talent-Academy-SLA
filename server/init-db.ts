import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "./db";
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
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set!");
  }
  
  // Log which database we're connected to (without exposing credentials)
  const isProduction = process.env.NODE_ENV === "production";
  console.log(`📊 Database environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`🔗 Database URL starts with: ${dbUrl.substring(0, 30)}...`);
  
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
