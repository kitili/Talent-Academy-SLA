import { sql } from "drizzle-orm";
import { teachers, users, type Teacher, type User } from "@shared/schema";
import { hashPassword, comparePasswords } from "./auth";
import { db, hasDatabaseUrl } from "./db";
import { storage } from "./storage";
import { pruneExtraDesksOnce, removeInactiveDesks } from "./deskRoster";
import { TEST_LOGINS, type TestLogin } from "./testLogins";

async function ensureStaff(login: TestLogin) {
  const [byUsername] = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.username}) = LOWER(${login.username})`)
    .limit(1);
  const [byEmail] = byUsername
    ? [byUsername]
    : await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${login.email}) AND ${users.role} = ${login.role}`)
        .limit(1);
  const existing = byEmail;

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        username: login.username,
        email: login.email,
        password: await hashPassword(login.password),
        role: login.role,
        approvalStatus: "approved",
        approvedAt: new Date(),
        firstName: login.firstName,
        lastName: login.lastName,
      })
      .returning();
    return created;
  }

  const passwordOk = await comparePasswords(login.password, existing.password);
  if (
    passwordOk
    && existing.role === login.role
    && existing.approvalStatus === "approved"
    && existing.username.toLowerCase() === login.username.toLowerCase()
    && (existing.email || "").toLowerCase() === login.email.toLowerCase()
  ) {
    return existing;
  }
  const [updated] = await db
    .update(users)
    .set({
      username: login.username,
      email: login.email,
      password: passwordOk ? existing.password : await hashPassword(login.password),
      role: login.role,
      approvalStatus: "approved",
      approvedAt: existing.approvedAt || new Date(),
      firstName: login.firstName,
      lastName: login.lastName,
    })
    .where(sql`${users.id} = ${existing.id}`)
    .returning();
  return updated;
}

async function ensureTeacher(login: TestLogin) {
  const [existing] = await db
    .select()
    .from(teachers)
    .where(sql`LOWER(${teachers.email}) = LOWER(${login.email})`)
    .limit(1);

  let teacher = existing;
  if (!teacher) {
    const nextId = await storage.getNextTeacherId();
    const [created] = await db
      .insert(teachers)
      .values({
        teacherId: nextId,
        name: login.name,
        email: login.email,
        password: await hashPassword(login.password),
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedByRole: "system",
      })
      .returning();
    teacher = created;
  } else {
    const passwordOk = await comparePasswords(login.password, teacher.password);
    if (passwordOk && teacher.approvalStatus === "approved" && teacher.name === login.name) {
      const card = await storage.getTeacherReportCard(teacher.id);
      if (!card) {
        await storage.upsertTeacherReportCard({
          teacherId: teacher.id,
          level: "Beginner",
          totalQuizzesTaken: 0,
          totalQuizzesPassed: 0,
          averageScore: 0,
        });
      }
      return teacher;
    }
    const [updated] = await db
      .update(teachers)
      .set({
        name: login.name,
        email: login.email,
        password: passwordOk ? teacher.password : await hashPassword(login.password),
        approvalStatus: "approved",
        approvedAt: teacher.approvedAt || new Date(),
      })
      .where(sql`${teachers.id} = ${teacher.id}`)
      .returning();
    teacher = updated;
  }

  const card = await storage.getTeacherReportCard(teacher.id);
  if (!card) {
    await storage.upsertTeacherReportCard({
      teacherId: teacher.id,
      level: "Beginner",
      totalQuizzesTaken: 0,
      totalQuizzesPassed: 0,
      averageScore: 0,
    });
  }
  return teacher;
}

export async function ensureTestLogin(login: TestLogin): Promise<{ user?: User; teacher?: Teacher }> {
  if (login.role === "teacher") {
    return { teacher: await ensureTeacher(login) };
  }
  return { user: await ensureStaff(login) };
}

export async function ensureAllTestLogins() {
  if (!hasDatabaseUrl()) return;
  for (const login of TEST_LOGINS) {
    await ensureTestLogin(login);
  }
  await pruneExtraDesksOnce();
  await removeInactiveDesks();
}
