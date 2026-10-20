import { eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { users, teachers, batches, batchTeachers, teacherReportCards } from "@shared/schema";
import { TEST_COHORTS, TEST_TEACHERS } from "./test-cohorts";

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

async function ensureCohort(adminId: string, trainerId: string, cohort: (typeof TEST_COHORTS)[number]) {
  const existing = await db.select().from(batches).where(eq(batches.id, cohort.id)).limit(1);
  if (!existing[0]) {
    await db.insert(batches).values({
      id: cohort.id,
      name: cohort.name,
      description: cohort.description,
      createdBy: adminId,
      trainerId,
    });
    console.log(`created ${cohort.name} for ${cohort.trainerUsername}`);
    return;
  }
  await db
    .update(batches)
    .set({ name: cohort.name, description: cohort.description, trainerId })
    .where(eq(batches.id, cohort.id));
  console.log(`kept ${cohort.name} with ${cohort.trainerUsername}`);
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
  return teacher.id;
}

async function main() {
  const adminId = await ensureUser({
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
  const trainerIds = new Map<string, string>();
  trainerIds.set("trainer1", await ensureUser({
    username: "trainer1",
    email: "trainer@test.com",
    role: "trainer",
    password: "trainer123",
    firstName: "Test",
    lastName: "Trainer",
  }));
  trainerIds.set("test.trainer", await ensureUser({
    username: "test.trainer",
    email: "test.trainer@silverleaf.academy",
    role: "trainer",
    password: "trainer123",
    firstName: "Test",
    lastName: "Trainer",
  }));
  for (const number of [2, 3, 4, 5, 6]) {
    trainerIds.set(`trainer${number}`, await ensureUser({
      username: `trainer${number}`,
      email: `trainer${number}@test.com`,
      role: "trainer",
      password: "trainer123",
      firstName: "Test",
      lastName: `Trainer ${number}`,
    }));
  }

  const teacherIds = new Map<string, string>();
  for (const teacher of TEST_TEACHERS) {
    teacherIds.set(teacher.email.toLowerCase(), await ensureTeacher(teacher.email, teacher.name));
  }

  for (const cohort of TEST_COHORTS) {
    const trainerId = trainerIds.get(cohort.trainerUsername);
    if (!trainerId) throw new Error(`Missing trainer ${cohort.trainerUsername}`);
    await ensureCohort(adminId, trainerId, cohort);
    for (const email of cohort.teacherEmails) {
      const teacherId = teacherIds.get(email.toLowerCase());
      if (!teacherId) throw new Error(`Missing teacher ${email}`);
      const enrolled = await db
        .select()
        .from(batchTeachers)
        .where(sql`${batchTeachers.batchId} = ${cohort.id} AND ${batchTeachers.teacherId} = ${teacherId}`)
        .limit(1);
      if (!enrolled[0]) {
        await db.insert(batchTeachers).values({ batchId: cohort.id, teacherId });
        console.log(`enrolled ${email} in ${cohort.name}`);
      }
    }
  }
  console.log("test accounts and batches ready; existing hashes were not overwritten");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
