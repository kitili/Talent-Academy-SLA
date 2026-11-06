import type { Express, Response } from "express";
import { sql } from "drizzle-orm";
import { attendanceCsv, type AttendanceExportMark } from "@shared/attendanceDesk";
import { trainerOwnsBatch } from "./access";
import { db } from "./db";
import type { RouteGuards } from "./routeGuards";
import { storage } from "./storage";

/**
 * One row per mark. `to_char` reads the date off the column itself, so no time zone can move it: raw SQL returns a
 * `timestamp` as text with no zone (docs/_learnings/a-timestamp-read-by-raw-sql-reaches-the-browser-without-its-zone.md).
 * People removed from the academy stay out, as they do on the attendance page.
 */
async function fellowMarks(batchId?: string): Promise<AttendanceExportMark[]> {
  const inCohort = batchId ? sql`AND a.batch_id = ${batchId}` : sql``;
  const result = await db.execute(sql`
    SELECT t.name AS person, t.fellow_type AS type, b.name AS cohort, to_char(a.date, 'YYYY-MM-DD') AS date, a.status
    FROM attendance_records a
    JOIN teachers t ON t.id = a.teacher_id
    JOIN batches b ON b.id = a.batch_id
    WHERE COALESCE(t.approval_status, 'approved') <> 'inactive' ${inCohort}
  `);
  return (result.rows as any[]).map((row) => ({ ...row, role: "teacher" }));
}

async function trainerMarks(): Promise<AttendanceExportMark[]> {
  const result = await db.execute(sql`
    SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.username) AS person,
      u.trainer_type AS type, b.name AS cohort, to_char(a.date, 'YYYY-MM-DD') AS date, a.status
    FROM trainer_attendance a
    JOIN users u ON u.id = a.trainer_id
    JOIN batches b ON b.id = a.batch_id
    WHERE u.role = 'trainer' AND COALESCE(u.approval_status, 'approved') <> 'inactive'
  `);
  return (result.rows as any[]).map((row) => ({ ...row, role: "trainer" }));
}

function sendCsv(res: Response, fileName: string, marks: AttendanceExportMark[]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}.csv"`);
  res.send(attendanceCsv(marks));
}

/** Attendance as CSV for a cohort or the whole academy. Contract: plans/sla-feedback-fixes/sla-feedback-fixes-plan.md. */
export function registerAttendanceExportRoutes(app: Express, guards: RouteGuards) {
  const { isAuthenticated, isTrainer, isAdmin } = guards;

  // A cohort's Fellows. Trainers' own marks are in the Admin's academy export only.
  app.get("/api/batches/:batchId/attendance.csv", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!trainerOwnsBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const slug = batch.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      sendCsv(res, `attendance-${slug || "cohort"}`, await fellowMarks(batch.id));
    } catch (error) {
      console.error("Error exporting cohort attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // The whole academy: every Fellow's mark and every Trainer's.
  app.get("/api/admin/attendance.csv", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [fellows, trainers] = await Promise.all([fellowMarks(), trainerMarks()]);
      sendCsv(res, "attendance", [...fellows, ...trainers]);
    } catch (error) {
      console.error("Error exporting academy attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
