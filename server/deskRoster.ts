import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  alertRules,
  assignedQuizzes,
  attendanceRecords,
  batchCertificateTemplates,
  batchCourses,
  batches,
  fellowDisqualifications,
  scheduledEvents,
  teachers,
  users,
  writtenAssignments,
} from "@shared/schema";
import { db } from "./db";

const FLAG = "desk_roster_v1";

async function keptIds() {
  const [admin] = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  const [trainer] = await db.select().from(users).where(eq(users.username, "trainer1")).limit(1);
  return { adminId: admin?.id, trainerId: trainer?.id };
}

/** Remove every trainer except trainer1 and every teacher except teacher@test.com. Runs once. */
export async function pruneExtraDesksOnce() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_flags (
      key varchar PRIMARY KEY,
      value text,
      created_at timestamp DEFAULT now()
    )
  `);
  const existing = await db.execute(sql`SELECT value FROM app_flags WHERE key = ${FLAG}`);
  if ((existing.rows || []).length > 0) return;

  const { adminId, trainerId } = await keptIds();
  if (!adminId || !trainerId) {
    throw new Error("desk roster needs admin and trainer1 before it can remove the other desks");
  }

  const extras = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "trainer"), ne(users.id, trainerId)));
  const extraIds = extras.map((row) => row.id);

  if (extraIds.length > 0) {
    await db.update(batches).set({ createdBy: adminId }).where(inArray(batches.createdBy, extraIds));
    await db.update(batches).set({ trainerId }).where(inArray(batches.trainerId, extraIds));
    await db.update(assignedQuizzes).set({ assignedBy: adminId }).where(inArray(assignedQuizzes.assignedBy, extraIds));
    await db.update(batchCourses).set({ assignedBy: adminId }).where(inArray(batchCourses.assignedBy, extraIds));
    await db
      .update(fellowDisqualifications)
      .set({ disqualifiedBy: adminId })
      .where(inArray(fellowDisqualifications.disqualifiedBy, extraIds));
    await db.update(attendanceRecords).set({ markedBy: null }).where(inArray(attendanceRecords.markedBy, extraIds));
    await db.update(alertRules).set({ createdBy: null }).where(inArray(alertRules.createdBy, extraIds));
    await db.update(scheduledEvents).set({ createdBy: null }).where(inArray(scheduledEvents.createdBy, extraIds));
    await db.update(writtenAssignments).set({ createdBy: null }).where(inArray(writtenAssignments.createdBy, extraIds));
    await db
      .update(batchCertificateTemplates)
      .set({ approvedBy: null })
      .where(inArray(batchCertificateTemplates.approvedBy, extraIds));
    await db.delete(users).where(inArray(users.id, extraIds));
  }

  await db.delete(teachers).where(sql`LOWER(${teachers.email}) <> 'teacher@test.com'`);
  await db.execute(sql`INSERT INTO app_flags (key, value) VALUES (${FLAG}, 'done') ON CONFLICT (key) DO NOTHING`);
}
