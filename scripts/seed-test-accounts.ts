import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { users, teachers, batchTeachers, teacherReportCards } from "@shared/schema";

const BATCH_ID = "49c90cb7-04d6-4402-b5b8-93a3ae5b6db9";

async function upsertAdmin() {
  const password = await hashPassword("admin123");
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (existing[0]) {
    await db
      .update(users)
      .set({ password, approvalStatus: "approved", email: existing[0].email || "admin@silverleaf.com" })
      .where(eq(users.id, existing[0].id));
    console.log("updated admin");
    return;
  }
  await db.insert(users).values({
    username: "admin",
    email: "admin@silverleaf.com",
    password,
    role: "admin",
    approvalStatus: "approved",
    firstName: "Admin",
    lastName: "User",
  });
  console.log("created admin");
}

async function upsertTrainer() {
  const password = await hashPassword("trainer123");
  const existing = await db.select().from(users).where(eq(users.username, "trainer1")).limit(1);
  if (existing[0]) {
    await db
      .update(users)
      .set({ password, approvalStatus: "approved", role: "trainer" })
      .where(eq(users.id, existing[0].id));
    console.log("updated trainer1");
    return existing[0].id;
  }
  const [created] = await db
    .insert(users)
    .values({
      username: "trainer1",
      email: "trainer@test.com",
      password,
      role: "trainer",
      approvalStatus: "approved",
      firstName: "Test",
      lastName: "Trainer",
    })
    .returning();
  console.log("created trainer1");
  return created.id;
}

async function upsertTeacher() {
  const password = await hashPassword("teacher123");
  const existing = await db
    .select()
    .from(teachers)
    .where(sql`LOWER(${teachers.email}) = LOWER('teacher@test.com')`)
    .limit(1);
  let teacher = existing[0];
  if (teacher) {
    await db
      .update(teachers)
      .set({ password, approvalStatus: "approved", name: teacher.name || "Test Teacher" })
      .where(eq(teachers.id, teacher.id));
    console.log("updated teacher@test.com");
  } else {
    const [maxRow] = await db.select({ maxId: sql<number>`COALESCE(MAX(${teachers.teacherId}), 7099)` }).from(teachers);
    const nextId = Number(maxRow?.maxId || 7099) + 1;
    const [created] = await db
      .insert(teachers)
      .values({
        teacherId: nextId,
        name: "Test Teacher",
        email: "teacher@test.com",
        password,
        approvalStatus: "approved",
      })
      .returning();
    teacher = created;
    console.log("created teacher@test.com");
  }

  const enrolled = await db
    .select()
    .from(batchTeachers)
    .where(sql`${batchTeachers.batchId} = ${BATCH_ID} AND ${batchTeachers.teacherId} = ${teacher.id}`)
    .limit(1);
  if (!enrolled[0]) {
    await db.insert(batchTeachers).values({ batchId: BATCH_ID, teacherId: teacher.id });
    console.log("enrolled teacher in Batch 1");
  }

  const card = await db.select().from(teacherReportCards).where(eq(teacherReportCards.teacherId, teacher.id)).limit(1);
  if (!card[0]) {
    await db.insert(teacherReportCards).values({
      teacherId: teacher.id,
      level: "Beginner",
      totalQuizzesTaken: 0,
      totalQuizzesPassed: 0,
      averageScore: 0,
    });
  }
}

async function main() {
  await upsertAdmin();
  await upsertTrainer();
  await upsertTeacher();
  console.log("test accounts ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
