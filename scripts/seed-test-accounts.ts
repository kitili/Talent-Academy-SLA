import { and, eq, sql } from "drizzle-orm";
import { db, ensureWrittenAssignmentTables } from "../server/db";
import { hashPassword } from "../server/auth";
import { users, teachers, batches, batchTeachers, teacherReportCards, courses, trainingWeeks, batchCourses } from "@shared/schema";
import { TEST_COHORTS, TEST_TEACHERS } from "./test-cohorts";
import { LEARNING_STAGES, LESSON_STAGES } from "../shared/tanzaniaPath";

/** Create a test desk, and set its documented password when the row already exists. */
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
    await db
      .update(users)
      .set({
        email: opts.email,
        password: await hashPassword(opts.password),
        role: opts.role,
        approvalStatus: "approved",
        firstName: opts.firstName,
        lastName: opts.lastName,
      })
      .where(eq(users.id, existing[0].id));
    console.log(`reset test login ${opts.username}`);
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
  const values = {
    name: cohort.name,
    description: cohort.description,
    stage: cohort.stage,
    track: cohort.track,
    createdBy: adminId,
    trainerId,
  };
  if (!existing[0]) {
    await db.insert(batches).values({ id: cohort.id, ...values });
    console.log(`created ${cohort.name} for ${cohort.trainerUsername}`);
    return;
  }
  await db.update(batches).set(values).where(eq(batches.id, cohort.id));
  console.log(`kept ${cohort.name} with ${cohort.trainerUsername}`);
}

async function ensureStageCourse(stage: (typeof LEARNING_STAGES)[number], orderIndex: number) {
  const objectives = `Government lesson: ${LESSON_STAGES.join(", ")}.`;
  const values = {
    name: stage.course,
    description: stage.summary,
    objectives,
    stage: stage.id,
    track: stage.track,
    publishStatus: "published",
    orderIndex,
  };
  const byId = await db.select().from(courses).where(eq(courses.id, stage.courseId)).limit(1);
  const byName = byId[0]
    ? byId
    : await db.select().from(courses).where(eq(courses.name, stage.course)).limit(1);
  let courseId = byName[0]?.id;
  if (!courseId) {
    const [created] = await db.insert(courses).values({ id: stage.courseId, ...values }).returning();
    courseId = created.id;
    console.log(`created course ${stage.course}`);
  } else {
    await db.update(courses).set(values).where(eq(courses.id, courseId));
    console.log(`kept course ${stage.course}`);
  }

  const existingWeeks = await db.select().from(trainingWeeks).where(eq(trainingWeeks.courseId, courseId));
  for (let index = 0; index < stage.modules.length; index += 1) {
    const weekNumber = index + 1;
    const module = stage.modules[index];
    const found = existingWeeks.find((week) => week.weekNumber === weekNumber);
    if (!found) {
      await db.insert(trainingWeeks).values({
        courseId,
        weekNumber,
        competencyFocus: module.focus,
        objective: module.objective,
      });
      continue;
    }
    const hasFiles = Array.isArray(found.deckFiles) && found.deckFiles.length > 0;
    if (!hasFiles) {
      await db.update(trainingWeeks).set({
        competencyFocus: module.focus,
        objective: module.objective,
      }).where(eq(trainingWeeks.id, found.id));
    }
  }
  return courseId;
}

async function ensureTeacher(email: string, name: string) {
  const existing = await db
    .select()
    .from(teachers)
    .where(sql`LOWER(${teachers.email}) = LOWER(${email})`)
    .limit(1);
  let teacher = existing[0];
  if (teacher) {
    await db.update(teachers).set({
      name,
      password: await hashPassword("teacher123"),
      approvalStatus: "approved",
    }).where(eq(teachers.id, teacher.id));
    console.log(`reset test login ${email}`);
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
  await ensureWrittenAssignmentTables();
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

  const courseIdByStage = new Map<string, string>();
  for (const [index, stage] of LEARNING_STAGES.entries()) {
    courseIdByStage.set(stage.id, await ensureStageCourse(stage, index));
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
    const courseId = courseIdByStage.get(cohort.stage);
    if (!courseId) throw new Error(`Missing course for ${cohort.stage}`);
    const assigned = await db
      .select()
      .from(batchCourses)
      .where(and(eq(batchCourses.batchId, cohort.id), eq(batchCourses.courseId, courseId)))
      .limit(1);
    if (!assigned[0]) {
      await db.insert(batchCourses).values({ batchId: cohort.id, courseId, assignedBy: adminId });
      console.log(`assigned ${cohort.name} its course`);
    }
  }
  console.log("test accounts ready with the documented test passwords");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
