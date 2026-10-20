import type { Pool, PoolClient } from "pg";

export const FRESH_START_PHRASE = "CLEAR ACTIVITY";

/** Login accounts and the approval record. Passwords are never selected or changed. */
export const KEPT_LOGIN_TABLES = [
  "users",
  "teachers",
  "user_profiles",
  "teacher_profiles",
  "approval_history",
] as const;

/**
 * Previous academy work, in child-before-parent order.
 * Identity tables are intentionally absent.
 */
export const CLEARED_ACTIVITY_TABLES = [
  "discussion_posts",
  "desk_messages",
  "assignment_submissions",
  "written_assignments",
  "open_ended_reviews",
  "teacher_quiz_attempts",
  "teacher_content_quiz_attempts",
  "teacher_quiz_regenerations",
  "teacher_content_progress",
  "deck_file_progress",
  "user_content_progress",
  "quiz_attempts",
  "quiz_cache",
  "assigned_quizzes",
  "teacher_certificates",
  "batch_certificate_templates",
  "teacher_course_completion",
  "course_repetitions",
  "teacher_report_cards",
  "attendance_records",
  "fellow_reflections",
  "fellow_disqualifications",
  "satisfaction_scores",
  "trainer_comments",
  "teacher_goals",
  "notifications",
  "scheduled_events",
  "security_violations",
  "audit_events",
  "batch_courses",
  "batch_teachers",
  "content_items",
  "training_weeks",
  "courses",
  "batches",
  "sessions",
] as const;

const CLEARED = new Set<string>(CLEARED_ACTIVITY_TABLES);

export function assertFreshStartIsSafe() {
  for (const table of KEPT_LOGIN_TABLES) {
    if (CLEARED.has(table)) {
      throw new Error(`Refusing to clear login table ${table}`);
    }
  }
}

export function activityDeleteSql(table: string) {
  if (!CLEARED.has(table)) {
    throw new Error(`Refusing to clear ${table}`);
  }
  return `DELETE FROM public.${table}`;
}

async function tableExists(client: PoolClient, table: string) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

export async function clearAcademyActivity(pool: Pool) {
  assertFreshStartIsSafe();
  const client = await pool.connect();
  const cleared: Record<string, number> = {};
  try {
    await client.query("BEGIN");
    for (const table of CLEARED_ACTIVITY_TABLES) {
      if (!(await tableExists(client, table))) {
        cleared[table] = 0;
        continue;
      }
      const result = await client.query(activityDeleteSql(table));
      cleared[table] = result.rowCount ?? 0;
    }
    if (await tableExists(client, "user_profiles")) {
      await client.query(`
        DELETE FROM public.user_profiles
        WHERE user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.users WHERE users.id = user_profiles.user_id)
      `);
    }
    if (await tableExists(client, "teacher_profiles")) {
      await client.query(`
        DELETE FROM public.teacher_profiles
        WHERE teacher_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.teachers WHERE teachers.id = teacher_profiles.teacher_id)
      `);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const removedRows = Object.values(cleared).reduce((sum, count) => sum + count, 0);
  return {
    kept: KEPT_LOGIN_TABLES,
    cleared,
    removedRows,
  };
}
