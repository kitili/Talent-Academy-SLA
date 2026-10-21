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

/** Never wiped, even when a cohort or a person is selected. */
export const PROTECTED_TABLES = [
  ...KEPT_LOGIN_TABLES,
  "courses",
  "sessions",
] as const;

export const ACTIVITY_AREAS = ["cohorts", "progress", "quizzes", "certificates", "notices"] as const;

export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export type ActivityScope = {
  areas: ActivityArea[];
  teacherIds: string[];
  trainerIds: string[];
};

const PROTECTED = new Set<string>(PROTECTED_TABLES);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export type ActivityStatement = {
  table: string;
  requires?: string[];
  sql: string;
  params: string[][];
};

function cleanIds(value: unknown): { ids: string[] } | { error: string } {
  if (value == null) return { ids: [] };
  if (!Array.isArray(value)) return { error: "Choose people from the academy list" };
  const ids: string[] = [];
  for (const item of value) {
    const id = String(item || "").trim();
    if (!id) continue;
    if (!ID_PATTERN.test(id)) return { error: "Choose people from the academy list" };
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > 100) return { error: "Choose up to 100 people at a time" };
  return { ids };
}

export function parseActivityScope(body: unknown): ActivityScope | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Choose what to clear and who it belongs to" };
  }
  const raw = body as Record<string, unknown>;
  if (String(raw.confirm || "") !== FRESH_START_PHRASE) {
    return { error: "Type CLEAR ACTIVITY to confirm" };
  }
  if (!Array.isArray(raw.areas) || raw.areas.length === 0) {
    return { error: "Choose at least one of cohorts, progress, quizzes, certificates, or notices" };
  }
  const areas: ActivityArea[] = [];
  for (const area of raw.areas) {
    if (!ACTIVITY_AREAS.includes(area as ActivityArea)) {
      return { error: "Unknown activity area" };
    }
    if (!areas.includes(area as ActivityArea)) areas.push(area as ActivityArea);
  }
  const teachers = cleanIds(raw.teacherIds);
  const trainers = cleanIds(raw.trainerIds);
  if ("error" in teachers) return teachers;
  if ("error" in trainers) return trainers;
  if (teachers.ids.length + trainers.ids.length === 0) {
    return { error: "Choose at least one person. This does not clear the whole academy." };
  }
  return { areas, teacherIds: teachers.ids, trainerIds: trainers.ids };
}

function del(table: string, column: string, ids: string[], requires?: string[]): ActivityStatement[] {
  if (!ids.length) return [];
  if (PROTECTED.has(table)) throw new Error(`Refusing to clear ${table}`);
  if (!/^[a-z_]+$/.test(column)) throw new Error(`Refusing to clear ${table}`);
  return [{
    table,
    requires,
    sql: `DELETE FROM public.${table} WHERE ${column} = ANY($1::varchar[])`,
    params: [ids],
  }];
}

function assertScoped(step: ActivityStatement) {
  if (PROTECTED.has(step.table)) throw new Error(`Refusing to clear ${step.table}`);
  if (!/\bWHERE\b/.test(step.sql)) throw new Error(`Refusing unscoped clear of ${step.table}`);
  for (const table of PROTECTED) {
    if (step.sql.includes(`public.${table}`)) throw new Error(`Refusing to clear ${table}`);
  }
}

/**
 * Statements for one scoped clear. Every statement names the people or the
 * cohorts those people own. An empty id list produces no statement.
 */
export function buildActivityStatements(scope: ActivityScope, batchIds: string[]): ActivityStatement[] {
  const steps: ActivityStatement[] = [];
  const people = [...scope.teacherIds, ...scope.trainerIds];
  const has = (area: ActivityArea) => scope.areas.includes(area);

  if (has("notices")) {
    steps.push(...del("notifications", "recipient_id", people));
  }

  if (has("progress")) {
    steps.push(
      ...del("teacher_content_progress", "teacher_id", scope.teacherIds),
      ...del("teacher_course_completion", "teacher_id", scope.teacherIds),
      ...del("course_repetitions", "teacher_id", scope.teacherIds),
      ...del("attendance_records", "teacher_id", scope.teacherIds),
      ...del("deck_file_progress", "user_id", scope.trainerIds),
      ...del("user_content_progress", "user_id", scope.trainerIds),
    );
    if (scope.teacherIds.length) {
      steps.push({
        table: "teacher_report_cards",
        sql: `UPDATE public.teacher_report_cards
              SET level = 'Beginner', total_quizzes_taken = 0, total_quizzes_passed = 0, average_score = 0, updated_at = now()
              WHERE teacher_id = ANY($1::varchar[])`,
        params: [scope.teacherIds],
      });
    }
  }

  if (has("quizzes")) {
    steps.push(
      ...del("open_ended_reviews", "teacher_id", scope.teacherIds),
      ...del("teacher_quiz_attempts", "teacher_id", scope.teacherIds),
      ...del("teacher_content_quiz_attempts", "teacher_id", scope.teacherIds),
      ...del("teacher_quiz_regenerations", "teacher_id", scope.teacherIds),
      ...del("quiz_attempts", "teacher_id", scope.teacherIds),
      ...del("quiz_attempts", "user_id", scope.trainerIds),
    );
    if (batchIds.length || scope.trainerIds.length) {
      const quizScope = `(batch_id = ANY($1::varchar[]) OR assigned_by = ANY($2::varchar[]))`;
      steps.push(
        {
          table: "open_ended_reviews",
          requires: ["assigned_quizzes"],
          sql: `DELETE FROM public.open_ended_reviews WHERE assigned_quiz_id IN (SELECT id FROM public.assigned_quizzes WHERE ${quizScope})`,
          params: [batchIds, scope.trainerIds],
        },
        {
          table: "teacher_quiz_attempts",
          requires: ["assigned_quizzes"],
          sql: `DELETE FROM public.teacher_quiz_attempts WHERE assigned_quiz_id IN (SELECT id FROM public.assigned_quizzes WHERE ${quizScope})`,
          params: [batchIds, scope.trainerIds],
        },
        {
          table: "assigned_quizzes",
          sql: `DELETE FROM public.assigned_quizzes WHERE ${quizScope}`,
          params: [batchIds, scope.trainerIds],
        },
      );
    }
  }

  if (has("certificates")) {
    steps.push(...del("teacher_certificates", "teacher_id", scope.teacherIds));
    steps.push(...del("teacher_certificates", "batch_id", batchIds));
    steps.push(...del("batch_certificate_templates", "batch_id", batchIds));
  }

  if (has("cohorts")) {
    steps.push(...del("batch_teachers", "teacher_id", scope.teacherIds));
    if (batchIds.length) {
      steps.push(
        {
          table: "assignment_submissions",
          requires: ["written_assignments"],
          sql: `DELETE FROM public.assignment_submissions WHERE assignment_id IN (SELECT id FROM public.written_assignments WHERE batch_id = ANY($1::varchar[]))`,
          params: [batchIds],
        },
        ...del("written_assignments", "batch_id", batchIds),
        ...del("scheduled_events", "batch_id", batchIds),
        ...del("alert_rules", "batch_id", batchIds),
        ...del("attendance_records", "batch_id", batchIds),
        ...del("teacher_course_completion", "batch_id", batchIds),
        ...del("course_repetitions", "batch_id", batchIds),
        ...del("teacher_certificates", "batch_id", batchIds),
        ...del("batch_certificate_templates", "batch_id", batchIds),
        {
          table: "open_ended_reviews",
          requires: ["assigned_quizzes"],
          sql: `DELETE FROM public.open_ended_reviews WHERE assigned_quiz_id IN (SELECT id FROM public.assigned_quizzes WHERE batch_id = ANY($1::varchar[]))`,
          params: [batchIds],
        },
        {
          table: "teacher_quiz_attempts",
          requires: ["assigned_quizzes"],
          sql: `DELETE FROM public.teacher_quiz_attempts WHERE assigned_quiz_id IN (SELECT id FROM public.assigned_quizzes WHERE batch_id = ANY($1::varchar[]))`,
          params: [batchIds],
        },
        ...del("assigned_quizzes", "batch_id", batchIds),
        ...del("batch_courses", "batch_id", batchIds),
        ...del("batch_teachers", "batch_id", batchIds),
        ...del("batches", "id", batchIds),
      );
    }
  }

  for (const step of steps) assertScoped(step);
  return steps;
}

export function assertFreshStartIsSafe() {
  const sample = buildActivityStatements(
    {
      areas: [...ACTIVITY_AREAS],
      teacherIds: ["teacher-1"],
      trainerIds: ["trainer-1"],
    },
    ["batch-1"],
  );
  if (sample.length === 0) throw new Error("Scoped clear produced no statements");
  for (const table of PROTECTED) {
    if (sample.some((step) => step.table === table || step.sql.includes(`public.${table}`))) {
      throw new Error(`Refusing to clear ${table}`);
    }
  }
}

async function tableExists(client: PoolClient, table: string) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

export async function clearSelectedActivity(pool: Pool, scope: ActivityScope) {
  assertFreshStartIsSafe();
  const client = await pool.connect();
  const cleared: Record<string, number> = {};
  try {
    await client.query("BEGIN");
    let batchIds: string[] = [];
    const needsBatches = scope.trainerIds.length > 0
      && scope.areas.some((area) => area === "cohorts" || area === "quizzes" || area === "certificates");
    if (needsBatches && await tableExists(client, "batches")) {
      const found = await client.query(
        `SELECT id FROM public.batches WHERE created_by = ANY($1::varchar[]) OR trainer_id = ANY($1::varchar[])`,
        [scope.trainerIds],
      );
      batchIds = found.rows.map((row) => String(row.id)).filter((id) => ID_PATTERN.test(id));
    }
    for (const step of buildActivityStatements(scope, batchIds)) {
      const needed = [step.table, ...(step.requires || [])];
      const present = await Promise.all(needed.map((table) => tableExists(client, table)));
      if (present.some((ok) => !ok)) {
        cleared[step.table] = cleared[step.table] ?? 0;
        continue;
      }
      const result = await client.query(step.sql, step.params);
      cleared[step.table] = (cleared[step.table] ?? 0) + (result.rowCount ?? 0);
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
    areas: scope.areas,
    people: scope.teacherIds.length + scope.trainerIds.length,
    cleared,
    removedRows,
  };
}
