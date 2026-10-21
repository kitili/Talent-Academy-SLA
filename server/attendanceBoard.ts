import { sql } from "drizzle-orm";
import { db } from "./db";

export type TeacherAttendanceRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  cohorts: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  rate: number | null;
};

export type TrainerCohortAttendance = {
  id: string;
  name: string;
  teachers: number;
  marked: number;
  rate: number | null;
};

export type TrainerAttendanceRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  marked: number;
  rate: number | null;
  cohorts: TrainerCohortAttendance[];
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rollupTrainer(cohorts: Array<{ marked: number; rate: number | null }>) {
  const marked = cohorts.reduce((sum, cohort) => sum + cohort.marked, 0);
  const weighted = cohorts.reduce(
    (sum, cohort) => sum + (cohort.rate == null ? 0 : cohort.rate * cohort.marked),
    0,
  );
  return { marked, rate: marked ? Math.round(weighted / marked) : null };
}

function rateOf(value: unknown, marked: number) {
  if (!marked || value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadAttendanceLists(): Promise<{
  teachers: TeacherAttendanceRow[];
  trainers: TrainerAttendanceRow[];
}> {
  const teacherRows = await db.execute(sql`
    SELECT
      t.id,
      t.name,
      COALESCE(t.username, '') AS username,
      t.email,
      COALESCE((
        SELECT string_agg(DISTINCT b.name, ', ' ORDER BY b.name)
        FROM batch_teachers bt
        JOIN batches b ON b.id = bt.batch_id
        WHERE bt.teacher_id = t.id
      ), '') AS cohorts,
      COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present,
      COUNT(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
      COUNT(a.id) FILTER (WHERE a.status = 'late')::int AS late,
      COUNT(a.id) FILTER (WHERE a.status = 'excused')::int AS excused,
      COUNT(a.id)::int AS marked,
      CASE
        WHEN COUNT(a.id) = 0 THEN NULL
        ELSE ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late'))::numeric
          / COUNT(a.id) * 100
        )::int
      END AS rate
    FROM teachers t
    LEFT JOIN attendance_records a ON a.teacher_id = t.id
    WHERE t.approval_status = 'approved'
    GROUP BY t.id
    ORDER BY t.name
  `);

  const trainerRows = await db.execute(sql`
    SELECT
      u.id,
      COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.username) AS name,
      u.username,
      COALESCE(u.email, '') AS email,
      b.id AS cohort_id,
      b.name AS cohort_name,
      COALESCE((
        SELECT COUNT(DISTINCT bt.teacher_id)::int
        FROM batch_teachers bt
        WHERE bt.batch_id = b.id
      ), 0) AS teachers,
      COALESCE((
        SELECT COUNT(*)::int FROM attendance_records ar WHERE ar.batch_id = b.id
      ), 0) AS marked,
      (
        SELECT ROUND(
          COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::numeric
          / NULLIF(COUNT(*), 0) * 100
        )::int
        FROM attendance_records ar
        WHERE ar.batch_id = b.id
      ) AS rate
    FROM users u
    LEFT JOIN (
      SELECT trainer_id, id AS cohort_id FROM batches WHERE trainer_id IS NOT NULL
      UNION
      SELECT trainer_id, cohort_id FROM cohort_trainers
    ) link ON link.trainer_id = u.id
    LEFT JOIN batches b ON b.id = link.cohort_id
    WHERE u.role = 'trainer' AND u.approval_status = 'approved'
    ORDER BY name, b.name
  `);

  const teachers = (teacherRows.rows as any[]).map((row) => {
    const marked = num(row.marked);
    return {
      id: String(row.id),
      name: String(row.name || row.username || "Teacher"),
      username: String(row.username || ""),
      email: String(row.email || ""),
      cohorts: String(row.cohorts || ""),
      present: num(row.present),
      absent: num(row.absent),
      late: num(row.late),
      excused: num(row.excused),
      marked,
      rate: rateOf(row.rate, marked),
    };
  });

  const trainers = new Map<string, TrainerAttendanceRow>();
  for (const row of trainerRows.rows as any[]) {
    const id = String(row.id);
    let trainer = trainers.get(id);
    if (!trainer) {
      trainer = {
        id,
        name: String(row.name || row.username || "Trainer"),
        username: String(row.username || ""),
        email: String(row.email || ""),
        marked: 0,
        rate: null,
        cohorts: [],
      };
      trainers.set(id, trainer);
    }
    if (!row.cohort_id) continue;
    const marked = num(row.marked);
    trainer.cohorts.push({
      id: String(row.cohort_id),
      name: String(row.cohort_name || "Cohort"),
      teachers: num(row.teachers),
      marked,
      rate: rateOf(row.rate, marked),
    });
  }

  for (const trainer of trainers.values()) {
    const rollup = rollupTrainer(trainer.cohorts);
    trainer.marked = rollup.marked;
    trainer.rate = rollup.rate;
  }

  return { teachers, trainers: [...trainers.values()] };
}
