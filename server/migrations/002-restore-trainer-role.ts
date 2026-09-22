import { db } from "../db";
import { users, teachers, approvalHistory } from "../../shared/schema";
import { eq, sql, asc } from "drizzle-orm";

/**
 * Migration: Restore Trainer Role
 *
 * This migration reverses the trainer-admin merger and restores "trainer" as a separate role.
 * Strategy: Keep the first admin account as admin (system admin), convert all others to trainers.
 *
 * You can override this behavior by setting environment variable:
 * ADMIN_IDS="id1,id2,id3" - Comma-separated list of user IDs to keep as admins
 *
 * Run this migration with: node -r esbuild-register server/migrations/002-restore-trainer-role.ts
 *
 * To rollback, run: node -r esbuild-register server/migrations/002-restore-trainer-role.ts rollback
 */

async function runMigration() {
  console.log("Starting migration: Restore Trainer Role...\n");

  try {
    // Step 1: Get all current admins
    console.log("Step 1: Fetching all current admins...");
    const allAdmins = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.createdAt));

    console.log(`Found ${allAdmins.length} admin(s) in database.`);

    if (allAdmins.length === 0) {
      console.log("No admins found. Migration not needed.");
      return;
    }

    // Step 2: Determine which admins should remain admins
    let adminIdsToKeep: string[] = [];

    if (process.env.ADMIN_IDS) {
      // Use environment variable if provided
      adminIdsToKeep = process.env.ADMIN_IDS.split(',').map(id => id.trim());
      console.log(`\nUsing ADMIN_IDS from environment: ${adminIdsToKeep.join(', ')}`);
    } else {
      // Default: Keep the first admin (oldest account) as admin
      adminIdsToKeep = [allAdmins[0].id];
      console.log(`\nDefault strategy: Keeping first admin as admin: ${allAdmins[0].username}`);
    }

    // Step 3: Identify admins to convert to trainers
    const adminsToConvert = allAdmins.filter(admin => !adminIdsToKeep.includes(admin.id));
    const adminsToKeep = allAdmins.filter(admin => adminIdsToKeep.includes(admin.id));

    console.log("\n--- Migration Plan ---");
    console.log(`Admins to remain as admin (${adminsToKeep.length}):`);
    adminsToKeep.forEach(admin => {
      console.log(`  ✓ ${admin.username} (${admin.email})`);
    });

    console.log(`\nAdmins to convert to trainer (${adminsToConvert.length}):`);
    adminsToConvert.forEach(admin => {
      console.log(`  → ${admin.username} (${admin.email})`);
    });

    if (adminsToConvert.length === 0) {
      console.log("\nNo admins to convert. Migration complete.");
      return;
    }

    // Step 4: Convert selected admins to trainers
    console.log("\nStep 4: Converting admins to trainers...");
    const trainerIds = adminsToConvert.map(a => a.id);

    for (const admin of adminsToConvert) {
      await db
        .update(users)
        .set({ role: "trainer" })
        .where(eq(users.id, admin.id));
    }

    console.log(`✓ Converted ${adminsToConvert.length} admin(s) to trainer.`);

    // Step 5: Update approval history records for converted users
    console.log("\nStep 5: Updating approval history records...");
    for (const admin of adminsToConvert) {
      await db
        .update(approvalHistory)
        .set({ performedByRole: "trainer" })
        .where(eq(approvalHistory.performedBy, admin.id));
    }
    console.log("✓ Updated approval history records.");

    // Step 6: Update teacher approval records for converted users
    console.log("\nStep 6: Updating teacher approval records...");
    for (const admin of adminsToConvert) {
      await db
        .update(teachers)
        .set({ approvedByRole: "trainer" })
        .where(eq(teachers.approvedBy, admin.id));
    }
    console.log("✓ Updated teacher approval records.");

    // Step 7: Verify migration
    console.log("\nStep 7: Verifying migration...");
    const newTrainers = await db
      .select()
      .from(users)
      .where(eq(users.role, "trainer"));

    const remainingAdmins = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"));

    console.log(`✓ Verification passed:`);
    console.log(`  - Trainers: ${newTrainers.length}`);
    console.log(`  - Admins: ${remainingAdmins.length}`);

    console.log(`\n✓ Migration completed successfully!`);
    console.log(`  Created ${newTrainers.length} trainer account(s)`);
    console.log(`  Retained ${remainingAdmins.length} admin account(s)\n`);

  } catch (error) {
    console.error("\n✗ Migration failed with error:");
    console.error(error);
    process.exit(1);
  }
}

async function rollbackMigration() {
  console.log("Starting rollback: Convert all trainers back to admins...\n");

  try {
    // Count current trainers
    const trainers = await db
      .select()
      .from(users)
      .where(eq(users.role, "trainer"));

    console.log(`Found ${trainers.length} trainer(s) to convert back to admin.`);

    if (trainers.length === 0) {
      console.log("No trainers found. Rollback not needed.");
      return;
    }

    // Convert all trainers back to admins
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.role, "trainer"));

    // Update approval history
    await db
      .update(approvalHistory)
      .set({ performedByRole: "admin" })
      .where(eq(approvalHistory.performedByRole, "trainer"));

    // Update teacher approvals
    await db
      .update(teachers)
      .set({ approvedByRole: "admin" })
      .where(eq(teachers.approvedByRole, "trainer"));

    console.log(`✓ Rollback completed successfully!`);
    console.log(`  Converted ${trainers.length} trainer(s) back to admin.\n`);

  } catch (error) {
    console.error("\n✗ Rollback failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run migration or rollback based on command line argument
const isRollback = process.argv.includes("rollback");

const operation = isRollback ? rollbackMigration() : runMigration();

operation
  .then(() => {
    console.log("Migration script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:");
    console.error(error);
    process.exit(1);
  });

export { runMigration, rollbackMigration };
