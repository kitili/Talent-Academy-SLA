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
import { db, pool } from "./db";

const FLAG = "desk_roster_v2";

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

  await db
    .update(users)
    .set({ approvalStatus: "inactive" })
    .where(and(eq(users.role, "trainer"), ne(users.id, trainerId)));
  await db
    .update(teachers)
    .set({ approvalStatus: "inactive" })
    .where(sql`LOWER(${teachers.email}) <> 'teacher@test.com'`);

  const extras = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "trainer"), ne(users.id, trainerId)));
  const extraIds = extras.map((row) => row.id);

  if (extraIds.length > 0) {
    try {
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
    } catch (error) {
      console.error("Extra trainers stay inactive:", error);
    }
  }

  try {
    await db.delete(teachers).where(sql`LOWER(${teachers.email}) <> 'teacher@test.com'`);
  } catch (error) {
    console.error("Extra teachers stay inactive:", error);
  }
  await db.execute(sql`INSERT INTO app_flags (key, value) VALUES (${FLAG}, 'done') ON CONFLICT (key) DO NOTHING`);
}

const OWNER_COLUMNS = new Set([
  "created_by",
  "trainer_id",
  "assigned_by",
  "approved_by",
  "marked_by",
  "disqualified_by",
  "awarded_by",
]);

export type DeskForeignKey = {
  table: string;
  column: string;
  nullable: boolean;
};

export type RemovalStep = DeskForeignKey & {
  action: "reassign" | "clear" | "delete";
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** How to detach one foreign key before an inactive account is deleted. */
export function removalSteps(keys: DeskForeignKey[]): RemovalStep[] {
  return keys
    .filter((key) => IDENTIFIER.test(key.table) && IDENTIFIER.test(key.column))
    .map((key) => {
      if (OWNER_COLUMNS.has(key.column)) return { ...key, action: "reassign" };
      if (key.column === "user_id" || key.column === "teacher_id") return { ...key, action: "delete" };
      if (key.nullable) return { ...key, action: "clear" };
      return { ...key, action: "delete" };
    });
}

export function isRemovableStaff(user: { username: string; role: string; approvalStatus: string }) {
  if (user.approvalStatus !== "inactive") return false;
  if (user.role === "admin") return false;
  return user.username !== "admin" && user.username !== "trainer1" && user.username !== "test.admin";
}

export function isRemovableTeacher(teacher: { email: string | null; approvalStatus: string }) {
  if (teacher.approvalStatus !== "inactive") return false;
  return (teacher.email || "").toLowerCase() !== "teacher@test.com";
}

function quoteIdent(name: string) {
  if (!IDENTIFIER.test(name)) throw new Error(`Unexpected column ${name}`);
  return `"${name}"`;
}

async function foreignKeys(referencedTable: "users" | "teachers"): Promise<DeskForeignKey[]> {
  const result = await pool.query(
    `SELECT kcu.table_name AS table_name, kcu.column_name AS column_name, c.is_nullable AS is_nullable
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     JOIN information_schema.columns c
       ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND ccu.table_name = $1
       AND ccu.column_name = 'id'`,
    [referencedTable],
  );
  return result.rows.map((row) => ({
    table: String(row.table_name),
    column: String(row.column_name),
    nullable: String(row.is_nullable).toUpperCase() === "YES",
  }));
}

async function applyRemovalSteps(steps: RemovalStep[], ids: string[], replacement: string | null) {
  for (const step of steps) {
    const table = quoteIdent(step.table);
    const column = quoteIdent(step.column);
    if (step.action === "reassign") {
      if (!replacement) continue;
      await pool.query(
        `UPDATE public.${table} SET ${column} = $1 WHERE ${column} = ANY($2::varchar[])`,
        [replacement, ids],
      );
      continue;
    }
    if (step.action === "clear") {
      await pool.query(
        `UPDATE public.${table} SET ${column} = NULL WHERE ${column} = ANY($1::varchar[])`,
        [ids],
      );
    }
  }

  let pending = steps.filter((step) => step.action === "delete");
  for (let pass = 0; pending.length > 0 && pass < pending.length + 2; pass += 1) {
    const stuck: RemovalStep[] = [];
    for (const step of pending) {
      const table = quoteIdent(step.table);
      const column = quoteIdent(step.column);
      try {
        await pool.query(
          `DELETE FROM public.${table} WHERE ${column} = ANY($1::varchar[])`,
          [ids],
        );
      } catch (error: any) {
        if (error?.code !== "23503") throw error;
        stuck.push(step);
      }
    }
    if (stuck.length === pending.length) {
      throw new Error(`Could not detach ${stuck.map((step) => `${step.table}.${step.column}`).join(", ")}`);
    }
    pending = stuck;
  }
}

async function forgetSessions(ids: string[]) {
  if (!ids.length) return;
  await pool.query(
    `DELETE FROM public.sessions s
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS gone(id)
       WHERE s.sess::text LIKE '%' || gone.id || '%'
     )`,
    [ids],
  ).catch(() => undefined);
}

/** Delete desks already marked inactive. trainer1, the admins, and teacher@test.com stay. */
export async function removeInactiveDesks() {
  const { adminId } = await keptIds();
  const staffRows = await db
    .select({ id: users.id, username: users.username, role: users.role, approvalStatus: users.approvalStatus })
    .from(users)
    .where(eq(users.approvalStatus, "inactive"));
  const staffIds = staffRows.filter(isRemovableStaff).map((row) => row.id);
  if (staffIds.length > 0) {
    await applyRemovalSteps(removalSteps(await foreignKeys("users")), staffIds, adminId || null);
    await forgetSessions(staffIds);
    await db.delete(users).where(inArray(users.id, staffIds));
  }

  const teacherRows = await db
    .select({ id: teachers.id, email: teachers.email, approvalStatus: teachers.approvalStatus })
    .from(teachers)
    .where(eq(teachers.approvalStatus, "inactive"));
  const teacherIds = teacherRows.filter(isRemovableTeacher).map((row) => row.id);
  if (teacherIds.length > 0) {
    await applyRemovalSteps(removalSteps(await foreignKeys("teachers")), teacherIds, null);
    await db.delete(teachers).where(inArray(teachers.id, teacherIds));
  }
}
