import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { users, teachers, batchTeachers, teacherReportCards } from "@shared/schema";

const BATCH_ID = "49c90cb7-04d6-4402-b5b8-93a3ae5b6db9";

/** Create a staff user only when missing. Never overwrite an existing hash. */
async function ensureUser(opts: {
  username: string;
  email: string;
  role: "admin" | "trainer";
  password: string;
  firstName: string;
  lastName: string;
}) {
  const existing = await db.select().from(users).where(eq(users.username, opts.username)).limit(1);
  if (existing[0]) {
    console.log(`keep existing ${opts.role} ${opts.username} (password unchanged)`);
    return existing[0].id;
  }
  const [created] = await db
    .insert(users)
    .values({
      username: opts.username,
      email: opts.email,
      password: await hashPassword(opts.password),
      role: opts.role,
      approvalStatus: "approved",
      firstName: opts.firstName,
      lastName: opts.lastName,
    })
    .returning();
  console.log(`created ${opts.role} ${opts.username}`);
  return created.id;
}

async function ensureTeacher(email: string, name: string) {
  const existing = await db
    .select()
    .from(teachers)
    .where(sql`LOWER(${teachers.email}) = LOWER(${email})`)
    .limit(1);
  let teacher = existing[0];
  if (teacher) {
    console.log(`keep existing ${email} (password unchanged)`);
  } else {
    const [maxRow] = await db.select({ maxId: sql<number>`COALESCE(MAX(${teachers.teacherId}), 7099)` }).from(teachers);
    const nextId = Number(maxRow?.maxId || 7099) + 1;
    const [created] = await db
      .insert(teachers)
      .values({
        teacherId: nextId,
        name,
        email,
        password: await hashPassword("teacher123"),
        approvalStatus: "approved",
      })
      .returning();
    teacher = created;
    console.log(`created ${email}`);
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
  await ensureUser({
    username: "admin",
    email: "admin@silverleaf.com",
    role: "admin",
    password: "admin123",
    firstName: "Admin",
    lastName: "User",
  });
  await ensureUser({
    username: "test.admin",
    email: "test.admin@silverleaf.academy",
    role: "admin",
    password: "admin123",
    firstName: "Test",
    lastName: "Admin",
  });
  await ensureUser({
    username: "trainer1",
    email: "trainer@test.com",
    role: "trainer",
    password: "trainer123",
    firstName: "Test",
    lastName: "Trainer",
  });
  await ensureUser({
    username: "test.trainer",
    email: "test.trainer@silverleaf.academy",
    role: "trainer",
    password: "trainer123",
    firstName: "Test",
    lastName: "Trainer",
  });
  await ensureTeacher("teacher@test.com", "Test Teacher");
  await ensureTeacher("qa.teacher@silverleaf.academy", "QA Teacher");
  console.log("test accounts ready; existing hashes were not overwritten");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
