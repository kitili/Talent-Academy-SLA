import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { exec } from "child_process";
import { existsSync } from "fs";
import { writeFile, readFile, unlink, mkdir, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError, directUploadsAvailable } from "./objectStorage";
import { UPLOAD_CONTENT_TYPES, UPLOAD_MAX_BYTES } from "@shared/uploads";
import { insertTrainingWeekSchema, updateTrainingWeekSchema, scheduledEvents, users, teachers, batches, batchCourses, batchTeachers, courses, teacherCourseCompletion, assignedQuizzes, quizAttempts, teacherReportCards, trainerStars, contentItems } from "@shared/schema";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { setupTeacherAuth, isTeacherAuthenticated } from "./teacherAuth";
import { z } from "zod";
import * as mammoth from "mammoth";
import { db, getDatabaseUrl, pool } from "./db";
import { clearSelectedActivity, parseActivityScope } from "./freshStart";
import {
  approvalHistoryPage,
  allApprovalHistorySelectSql,
  approvalHistoryToCsv,
  batchApprovalHistoryCountSql,
  batchApprovalHistorySelectSql,
  mapApprovalHistoryRow,
} from "./approvalHistoryQuery";
import { isAcademyStaff, trainerOwnsBatch } from "./access";
import { isAttendanceStatus } from "@shared/attendanceDesk";
import { DEADLINE_PASSED, fellowStillSees, isPastDue, parseDeadline } from "@shared/academyPath";
import { ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT, QUIZ_ATTEMPTS, refusal } from "@shared/constants";
import { cohortIsOpen, trainerMayEditCourse } from "./scope";
import { cohortsInScope, trainerCohortCounts } from "./cohortRoster";
import { OPS_AREAS, OPS_DOCUMENTS, OPS_TABLES } from "@shared/opsCatalog";
import { eq, and, or, sql, asc } from "drizzle-orm";
import { moduleIsComplete } from "./progressLogic";
import { cohortMedals } from "@shared/cohortMedals";
import { recordAudit } from "./audit";
import { sanitizeLessonHtml } from "./htmlSanitize";
import { signFileGrant, verifyFileGrant } from "./fileGrant";
import { passMarkOf, shuffleQuestions } from "./quizDelivery";
import { isWritingExam } from "@shared/trainerDesk";
import { blockAssignedQuiz, blockCourseEdit, blockTeacherWeekQuiz, editableModule } from "./cohortGate";
import { normalizeManualQuestions } from "./quizService";
import { answerReview, assignedQuizStanding, attemptQuizView, gradeLessonQuiz, isLiveLessonQuiz, learnerQuiz, learnerQuestions, lessonQuizForViewer } from "./learnerQuiz";
import { computeCourseCompletion } from "./completion";
import {
  cohortCourseFigures,
  cohortPath,
  cohortQuizSignalsFor,
  courseCheckRefusal,
  discussionAccess,
  lessonFileStates,
  markReadProgress,
  memoizedPathReaders,
  moduleProgress,
  nextCourseCompletion,
  teacherModuleAccess,
  trainerMaySeeTeacherModule,
  visibleDiscussionPosts,
} from "./learnerPath";
import { sendTransactionalEmail } from "./mailer";
import { setupSso, ssoStatus } from "./sso";
import { lessonFromPackage } from "./scormImport";
import { registerAcademyPathRoutes } from "./academyPathRoutes";
import { publicFellow, registerAcademyDeskRoutes } from "./academyDesk";
import { audienceWithNames, canRunOnlineSessions, countKinds, fellowTypeOf, FELLOW_TYPES, parseOnlineFields, trainerTypeOf, TRAINER_TYPES } from "@shared/academyPeople";
import { certificateCohortAccess, certificateRefusal, listEligibleFellows, loadEligibilityRows } from "./certificateEligibility";
import { loadAttendanceLists } from "./attendanceBoard";
import { encouragementFor } from "./trainerEncouragement";
import multer from "multer";

const packageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const execAsync = promisify(exec);

// Middleware to check if user is authenticated
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Middleware to check if user is admin
function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden: Admin access required" });
}

// Middleware to check if user is trainer or admin (content/teacher/batch management)
function isTrainer(req: Request, res: Response, next: NextFunction) {
  if (req.user && (req.user.role === "admin" || req.user.role === "trainer")) {
    return next();
  }
  res.status(403).json({ message: "Forbidden: Trainer or Admin access required" });
}

// Middleware to check if user is strictly admin (user management, admin approvals)
function isStrictAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden: Admin-only access required" });
}

function staffCanAccessBatch(
  user?: Express.User,
  batch?: { trainerId?: string | null; trainerIds?: string[] | null } | null,
) {
  if (batch === undefined) return isAcademyStaff(user);
  return trainerOwnsBatch(user, batch);
}

function fileRequestAllowed(req: Request) {
  if (req.isAuthenticated?.() && req.user) return true;
  if ((req.session as any)?.teacherId) return true;
  return verifyFileGrant(String(req.query.url || ""), req.query.exp, req.query.sig);
}

function publishedOnly<T extends { publishStatus?: string | null }>(rows: T[], req: Request) {
  if (isAcademyStaff(req.user)) return rows;
  return rows.filter((row) => row.publishStatus !== "draft");
}

async function teacherRecordAllowed(req: Request, teacherId: string) {
  const sessionTeacherId = (req.session as any)?.teacherId as string | undefined;
  if (sessionTeacherId && sessionTeacherId === teacherId) return true;
  if (req.user?.role === "admin") return true;
  if (req.user?.role !== "trainer" || !req.user.id) return false;
  const owned = await storage.getAllBatches(req.user.id);
  for (const batch of owned) {
    const enrolled = await storage.getTeachersInBatch(batch.id);
    if (enrolled.some((teacher) => teacher.id === teacherId)) return true;
  }
  return false;
}

async function notifyTeacher(teacherId: string, title: string, message: string, type = "general", metadata: Record<string, unknown> = {}) {
  await storage.createNotification({
    recipientId: teacherId,
    recipientType: "teacher",
    type,
    title,
    message,
    metadata,
  });
  try {
    const teacher = await storage.getTeacher(teacherId);
    await sendTransactionalEmail(teacher?.email, title, message);
  } catch (error) {
    console.error("Email notice failed:", error);
  }
}

async function notifyBatchTeachers(batchId: string, title: string, message: string, type = "general") {
  const enrolled = await storage.getTeachersInBatch(batchId);
  for (const teacher of enrolled) {
    await notifyTeacher(teacher.id, title, message, type, { batchId });
  }
}

function cleanTeacherIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
}

async function resolveQuizAudience(batchId: string, requested: unknown) {
  const ids = cleanTeacherIds(requested);
  if (ids.length === 0) return { teacherIds: [] as string[] };
  const enrolled = await storage.getTeachersInBatch(batchId);
  const allowed = new Set(enrolled.map((teacher) => teacher.id));
  const teacherIds = ids.filter((id) => allowed.has(id));
  if (teacherIds.length === 0) return { teacherIds, error: "Choose teachers who are in this cohort" };
  return { teacherIds };
}

async function notifyQuizTeachers(batchId: string, teacherIds: string[], title: string, message: string) {
  if (teacherIds.length === 0) {
    await notifyBatchTeachers(batchId, title, message, "deadline");
    return;
  }
  for (const teacherId of teacherIds) {
    await notifyTeacher(teacherId, title, message, "deadline", { batchId });
  }
}

async function saveWritingExam(
  batchId: string,
  assignedBy: string,
  body: { title?: string; description?: string; prompt?: string; paperUrl?: string; paperName?: string; teacherIds?: unknown; dueDate?: unknown },
) {
  const title = String(body.title || "").trim();
  if (!title) return { error: "Add a title", status: 400 as const };
  const audience = await resolveQuizAudience(batchId, body.teacherIds);
  if (audience.error) return { error: audience.error, status: 400 as const };
  const prompt = String(body.prompt || "").trim() || "Write your answers in the document beside this paper.";
  const quiz = await storage.createAssignedQuiz({
    batchId,
    weekId: null,
    title,
    description: body.description ? String(body.description) : null,
    paperUrl: body.paperUrl || null,
    paperName: body.paperName || null,
    numQuestions: 1,
    passMark: ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT,
    questions: [{ id: randomUUID(), type: "open_ended", question: prompt }],
    assignedBy,
    dueDate: parseDeadline(body.dueDate),
  });
  await storage.replaceQuizAudience(quiz.id, audience.teacherIds);
  return { quiz, teacherIds: audience.teacherIds };
}

type TeacherLearningSummary = {
  progress: number;
  filesViewed: number;
  courseCompletion: number;
  lastActive?: string | Date | null;
};

function emptyTeacherSummary(): TeacherLearningSummary {
  return { progress: 0, filesViewed: 0, courseCompletion: 0, lastActive: null };
}

function pct(part: number, whole: number) {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

async function loadTeacherLearningSummaries(): Promise<Map<string, TeacherLearningSummary>> {
  const summaries = new Map<string, TeacherLearningSummary>();
  const ensure = (id: string) => {
    if (!summaries.has(id)) summaries.set(id, emptyTeacherSummary());
    return summaries.get(id)!;
  };

  try {
    const cards = await db.select().from(teacherReportCards);
    for (const card of cards) {
      const row = ensure(card.teacherId);
      row.progress = card.averageScore || 0;
      row.filesViewed = card.totalQuizzesTaken || 0;
      row.courseCompletion = Math.min(100, (card.totalQuizzesPassed || 0) * 10);
    }
  } catch (error) {
    console.error("Teacher report cards unavailable:", error);
  }

  try {
    const fileRows = await db.execute(sql`
      SELECT
        teacher_id,
        COUNT(*) FILTER (
          WHERE viewed_at IS NOT NULL
             OR status IN ('in_progress', 'quiz_required', 'completed')
        )::int AS files_viewed,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS files_completed,
        COUNT(*)::int AS files_total,
        MAX(COALESCE(completed_at, viewed_at)) AS last_active
      FROM teacher_content_progress
      GROUP BY teacher_id
    `);
    for (const raw of fileRows.rows as any[]) {
      const row = ensure(String(raw.teacher_id));
      row.filesViewed = Number(raw.files_viewed || 0);
      if (Number(raw.files_total || 0) > 0) {
        row.progress = pct(Number(raw.files_completed || 0), Number(raw.files_total || 0));
      }
      if (raw.last_active) row.lastActive = raw.last_active;
    }
  } catch (error) {
    console.error("Teacher file progress unavailable:", error);
  }

  try {
    const courseRows = await db.execute(sql`
      SELECT
        teacher_id,
        COALESCE(SUM(completed_weeks), 0)::int AS completed_weeks,
        COALESCE(SUM(total_weeks), 0)::int AS total_weeks,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS courses_done,
        COUNT(*)::int AS courses_enrolled
      FROM teacher_course_completion
      GROUP BY teacher_id
    `);
    for (const raw of courseRows.rows as any[]) {
      const row = ensure(String(raw.teacher_id));
      if (Number(raw.total_weeks || 0) > 0) {
        row.courseCompletion = pct(Number(raw.completed_weeks || 0), Number(raw.total_weeks || 0));
      } else if (Number(raw.courses_enrolled || 0) > 0) {
        row.courseCompletion = pct(Number(raw.courses_done || 0), Number(raw.courses_enrolled || 0));
      }
    }
  } catch (error) {
    console.error("Teacher course completion unavailable:", error);
  }

  return summaries;
}

// Middleware to allow both regular auth and teacher auth
function isAuthenticatedAny(req: Request, res: Response, next: NextFunction) {
  const isRegularUser = req.isAuthenticated();
  const teacherId = (req.session as any)?.teacherId;
  const isTeacher = !!teacherId;
  
  if (isRegularUser || isTeacher) {
    // Set teacherId on request object for teacher users
    if (isTeacher) {
      req.teacherId = teacherId;
    }
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

  app.get("/api/health", async (_req, res) => {
    const database = Boolean(getDatabaseUrl());
    const sessionSecret = Boolean(process.env.SESSION_SECRET);
    const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
    let databaseReachable = false;
    if (database) {
      try {
        await db.execute(sql`select 1`);
        databaseReachable = true;
      } catch {
        databaseReachable = false;
      }
    }
    const ok = database && sessionSecret && databaseReachable;
    let databaseHost = "";
    try {
      databaseHost = new URL(getDatabaseUrl()).host;
    } catch {
      databaseHost = "";
    }
    res.status(ok ? 200 : 503).json({
      ok,
      database,
      databaseReachable,
      databaseHost,
      sessionSecret,
      blob,
      blobStore: Boolean(process.env.BLOB_STORE_ID),
      sso: ssoStatus(),
      mail: Boolean(process.env.RESEND_API_KEY),
      week: 3,
      backup: "Neon point-in-time restore. Keep one academy database.",
    });
  });

  // Setup authentication (username/password)
  setupAuth(app);

  app.get("/api/admin/ops-catalog", isAuthenticated, isStrictAdmin, async (_req, res) => {
    res.json({
      areas: OPS_AREAS,
      tables: OPS_TABLES,
      documents: OPS_DOCUMENTS,
      howToFind:
        "In Supabase Table Editor every table description starts with [identity], [onboarding], [learning], [classroom], [communications], [marketing], or [security]. Query SELECT * FROM ops.catalog for the same map.",
    });
  });
  setupTeacherAuth(app);
  setupSso(app);
  // Note: /api/register, /api/login, /api/logout, /api/user are now in auth.ts
  // Note: /api/teacher/* routes are in teacherAuth.ts

  app.post("/api/emergency-admin-reset", async (_req, res) => {
    res.status(403).json({ error: "This academy only accepts the test logins." });
  });

  // Admin password reset endpoint
  const resetPasswordSchema = z.object({
    userIdentifier: z.string().trim().min(1, "Username, email, or teacher ID required"),
    newPassword: z.string().trim().min(6, "Password must be at least 6 characters"),
  });

  app.post("/api/admin/reset-user-password", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { userIdentifier, newPassword } = resetPasswordSchema.parse(req.body);
      
      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Try to find user by username or email (trainers/admins)
      let user = await storage.getUserByUsername(userIdentifier);
      if (!user) {
        user = await storage.getUserByEmail(userIdentifier);
      }
      
      if (user) {
        // Update user's password
        const updatedUser = await storage.updateUserPassword(user.id, hashedPassword);

        if (!updatedUser) {
          return res.status(500).json({ error: "Failed to update password" });
        }

        // Sync password to linked teacher accounts with the same email
        let syncInfo = "";
        if (updatedUser.email) {
          const synced = await storage.syncPasswordByEmail(updatedUser.email, hashedPassword, 'users');
          if (synced.teachersUpdated > 0) {
            syncInfo = ` (also updated ${synced.teachersUpdated} linked teacher account${synced.teachersUpdated > 1 ? 's' : ''})`;
          }
        }

        return res.json({
          success: true,
          message: `Password reset successful for user: ${updatedUser.username}${syncInfo}`
        });
      }

      // If not found as user, try to find as teacher
      let teacher;

      // Try parsing as numeric teacher ID
      const numericId = parseInt(userIdentifier);
      if (!isNaN(numericId)) {
        teacher = await storage.getTeacherByTeacherId(numericId);
      }

      // If not found by teacher ID, try email
      if (!teacher) {
        teacher = await storage.getTeacherByEmail(userIdentifier);
      }

      // If still not found, try searching by name
      if (!teacher) {
        const teachersByName = await storage.getTeacherByName(userIdentifier);
        if (teachersByName.length === 1) {
          teacher = teachersByName[0];
        } else if (teachersByName.length > 1) {
          const teacherList = teachersByName
            .map(t => `${t.name} (ID: ${t.teacherId}, Email: ${t.email})`)
            .join(", ");
          return res.status(400).json({
            error: `Multiple teachers found with name "${userIdentifier}". Please use teacher ID or email instead: ${teacherList}`
          });
        }
      }

      if (!teacher) {
        return res.status(404).json({ error: "User or teacher not found" });
      }

      // Update teacher's password
      const updatedTeacher = await storage.updateTeacherPassword(teacher.id, hashedPassword);

      if (!updatedTeacher) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      // Sync password to linked admin/trainer accounts with the same email
      let teacherSyncInfo = "";
      const synced = await storage.syncPasswordByEmail(updatedTeacher.email, hashedPassword, 'teachers');
      if (synced.usersUpdated > 0) {
        teacherSyncInfo = ` (also updated ${synced.usersUpdated} linked admin/trainer account${synced.usersUpdated > 1 ? 's' : ''})`;
      }

      res.json({
        success: true,
        message: `Password reset successful for teacher: ${updatedTeacher.name} (ID: ${updatedTeacher.teacherId})${teacherSyncInfo}`
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin email update endpoint
  const updateEmailSchema = z.object({
    userIdentifier: z.string().trim().min(1, "Username, email, or teacher ID required"),
    newEmail: z.string().trim().email("Please enter a valid email address"),
  });

  app.post("/api/admin/update-user-email", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userIdentifier, newEmail } = updateEmailSchema.parse(req.body);

      // Check if the new email is already in use
      const existingUser = await storage.getUserByEmail(newEmail);
      const existingTeacher = await storage.getTeacherByEmail(newEmail);

      if (existingUser || existingTeacher) {
        return res.status(400).json({ error: "This email is already in use by another account" });
      }

      // Try to find user by username or email (trainers/admins)
      let user = await storage.getUserByUsername(userIdentifier);
      if (!user) {
        user = await storage.getUserByEmail(userIdentifier);
      }

      if (user) {
        const updatedUser = await db.update(users)
          .set({ email: newEmail })
          .where(eq(users.id, user.id))
          .returning();

        if (!updatedUser.length) {
          return res.status(500).json({ error: "Failed to update email" });
        }

        return res.json({
          success: true,
          message: `Email updated successfully for user: ${updatedUser[0].username}`
        });
      }

      // If not found as user, try to find as teacher
      let teacher;
      const numericId = parseInt(userIdentifier);
      if (!isNaN(numericId)) {
        teacher = await storage.getTeacherByTeacherId(numericId);
      }
      if (!teacher) {
        teacher = await storage.getTeacherByEmail(userIdentifier);
      }
      if (!teacher) {
        const teachersByName = await storage.getTeacherByName(userIdentifier);
        if (teachersByName.length === 1) {
          teacher = teachersByName[0];
        } else if (teachersByName.length > 1) {
          const teacherList = teachersByName
            .map(t => `${t.name} (ID: ${t.teacherId}, Email: ${t.email})`)
            .join(", ");
          return res.status(400).json({
            error: `Multiple teachers found with name "${userIdentifier}". Please use teacher ID or email instead: ${teacherList}`
          });
        }
      }

      if (!teacher) {
        return res.status(404).json({ error: "User or teacher not found" });
      }

      const updatedTeacher = await db.update(teachers)
        .set({ email: newEmail })
        .where(eq(teachers.id, teacher.id))
        .returning();

      if (!updatedTeacher.length) {
        return res.status(500).json({ error: "Failed to update email" });
      }

      res.json({
        success: true,
        message: `Email updated successfully for teacher: ${updatedTeacher[0].name} (ID: ${updatedTeacher[0].teacherId})`
      });
    } catch (error) {
      console.error("Error updating email:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Self-service profile change endpoints (syncs across admin/trainer + teacher accounts with same email)

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().trim().min(6, "New password must be at least 6 characters"),
  });

  app.post("/api/profile/change-password", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const user = req.user!;
      const passwordMatch = await comparePasswords(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);
      if (user.email) {
        await storage.syncPasswordByEmail(user.email, hashedPassword, 'users');
      }
      res.json({ success: true, message: "Password changed successfully for all linked accounts" });
    } catch (error) {
      console.error("Error changing password:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const changeEmailSchema = z.object({
    currentPassword: z.string().min(1, "Password is required to change email"),
    newEmail: z.string().trim().email("Invalid email address"),
  });

  app.post("/api/profile/change-email", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newEmail } = changeEmailSchema.parse(req.body);
      const user = req.user!;
      const passwordMatch = await comparePasswords(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Password is incorrect" });
      }
      const oldEmail = user.email;
      const existingUsers = await storage.getAllUsersByEmail(newEmail);
      const otherUsers = existingUsers.filter(u => u.id !== user.id);
      if (otherUsers.length > 0) {
        return res.status(400).json({ error: "Email is already in use by another account" });
      }
      const existingTeachers = await storage.getAllTeachersByEmail(newEmail);
      if (oldEmail) {
        const linkedTeachers = await storage.getAllTeachersByEmail(oldEmail);
        const linkedTeacherIds = new Set(linkedTeachers.map(t => t.id));
        const unlinkedNewTeachers = existingTeachers.filter(t => !linkedTeacherIds.has(t.id));
        if (unlinkedNewTeachers.length > 0) {
          return res.status(400).json({ error: "Email is already in use by another account" });
        }
      } else if (existingTeachers.length > 0) {
        return res.status(400).json({ error: "Email is already in use by another account" });
      }
      await storage.updateUserEmail(user.id, newEmail);
      if (oldEmail) {
        await storage.syncEmailByOldEmail(oldEmail, newEmail);
      }
      res.json({ success: true, message: "Email changed successfully for all linked accounts" });
    } catch (error) {
      console.error("Error changing email:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teacher/profile/change-password", isTeacherAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const teacherId = req.teacherId!;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      const passwordMatch = await comparePasswords(currentPassword, teacher.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateTeacherPassword(teacher.id, hashedPassword);
      await storage.syncPasswordByEmail(teacher.email, hashedPassword, 'teachers');
      res.json({ success: true, message: "Password changed successfully for all linked accounts" });
    } catch (error) {
      console.error("Error changing teacher password:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teacher/profile/change-email", isTeacherAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newEmail } = changeEmailSchema.parse(req.body);
      const teacherId = req.teacherId!;
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      const passwordMatch = await comparePasswords(currentPassword, teacher.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Password is incorrect" });
      }
      const oldEmail = teacher.email;
      const existingTeachers = await storage.getAllTeachersByEmail(newEmail);
      const otherTeachers = existingTeachers.filter(t => t.id !== teacher.id);
      if (otherTeachers.length > 0) {
        return res.status(400).json({ error: "Email is already in use by another account" });
      }
      const existingUsers = await storage.getAllUsersByEmail(newEmail);
      const linkedUsers = await storage.getAllUsersByEmail(oldEmail);
      const linkedUserIds = new Set(linkedUsers.map(u => u.id));
      const unlinkedNewUsers = existingUsers.filter(u => !linkedUserIds.has(u.id));
      if (unlinkedNewUsers.length > 0) {
        return res.status(400).json({ error: "Email is already in use by another account" });
      }
      await storage.updateTeacherEmail(teacher.id, newEmail);
      await storage.syncEmailByOldEmail(oldEmail, newEmail);
      res.json({ success: true, message: "Email changed successfully for all linked accounts" });
    } catch (error) {
      console.error("Error changing teacher email:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Extended Profile Endpoints ──────────────────────────────────────────

  // Get admin/trainer extended profile
  app.get("/api/profile/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const user = req.user as any;
      const profile = await storage.getUserProfile(userId);
      res.json({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        role: user.role || "",
        fatherName: profile?.fatherName || "",
        phoneNumber: profile?.phoneNumber || "",
        qualification: profile?.qualification || "",
        cnic: profile?.cnic || "",
        gender: profile?.gender || "",
        dateOfBirth: profile?.dateOfBirth || null,
      });
    } catch (error) {
      console.error("Error getting user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update admin/trainer extended profile
  app.put("/api/profile/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { firstName, lastName, fatherName, phoneNumber, qualification, cnic, gender, dateOfBirth } = req.body;
      // Update first/last name on the users table
      if (firstName !== undefined || lastName !== undefined) {
        await db.update(users)
          .set({
            ...(firstName !== undefined ? { firstName } : {}),
            ...(lastName !== undefined ? { lastName } : {}),
          })
          .where(eq(users.id, userId));
      }
      // Upsert extended profile
      const profile = await storage.upsertUserProfile(userId, {
        fatherName: fatherName || null,
        phoneNumber: phoneNumber || null,
        qualification: qualification || null,
        cnic: cnic || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      });
      res.json({ success: true, profile });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher extended profile
  app.get("/api/teacher/profile/details", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId;
      if (!teacherId) return res.status(401).json({ error: "Not authenticated as teacher" });
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });
      const profile = await storage.getTeacherProfile(teacherId);
      res.json({
        name: teacher.name || "",
        email: teacher.email || "",
        gender: teacher.gender || "",
        qualification: teacher.qualification || "",
        location: teacher.location || "",
        fatherName: profile?.fatherName || "",
        phoneNumber: profile?.phoneNumber || "",
        cnic: profile?.cnic || "",
      });
    } catch (error) {
      console.error("Error getting teacher profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update teacher extended profile
  app.put("/api/teacher/profile/details", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId;
      if (!teacherId) return res.status(401).json({ error: "Not authenticated as teacher" });
      const { name, gender, qualification, location, fatherName, phoneNumber, cnic } = req.body;
      // Update core teacher fields on teachers table
      const coreUpdates: Record<string, any> = {};
      if (name !== undefined) coreUpdates.name = name;
      if (gender !== undefined) coreUpdates.gender = gender;
      if (qualification !== undefined) coreUpdates.qualification = qualification;
      if (location !== undefined) coreUpdates.location = location;
      if (Object.keys(coreUpdates).length > 0) {
        await db.update(teachers).set(coreUpdates).where(eq(teachers.id, teacherId));
      }
      // Upsert extended profile
      const profile = await storage.upsertTeacherProfile(teacherId, {
        fatherName: fatherName || null,
        phoneNumber: phoneNumber || null,
        cnic: cnic || null,
      });
      res.json({ success: true, profile });
    } catch (error) {
      console.error("Error updating teacher profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approval routes for admin
  app.get("/api/admin/pending-trainers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const pendingTrainers = await storage.getPendingTrainers();
      // Remove password from response
      const sanitized = pendingTrainers.map(({ password, ...trainer }) => trainer);
      res.json(sanitized);
    } catch (error) {
      console.error("Error getting pending trainers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/pending-teachers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const pendingTeachers = await storage.getPendingTeachers();
      // Remove password from response
      const sanitized = pendingTeachers.map(({ password, ...teacher }) => teacher);
      res.json(sanitized);
    } catch (error) {
      console.error("Error getting pending teachers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/approve-trainer/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const approvedBy = req.user!.id;
      
      // Get trainer info before approving
      const trainerBefore = await storage.getUser(id);
      if (!trainerBefore) {
        return res.status(404).json({ error: "Trainer not found" });
      }
      
      const approvedUser = await storage.approveUser(id, approvedBy);
      if (!approvedUser) {
        return res.status(404).json({ error: "Trainer not found" });
      }
      
      // Record approval history
      await storage.addApprovalHistory({
        targetType: "trainer",
        targetId: id,
        targetName: approvedUser.username,
        targetEmail: approvedUser.email || undefined,
        action: "approved",
        performedBy: approvedBy,
        performedByName: req.user!.username,
        performedByRole: "admin",
      });
      
      const { password, ...sanitized } = approvedUser;
      res.json({ 
        success: true, 
        message: `Trainer ${approvedUser.username} has been approved`,
        user: sanitized 
      });
    } catch (error) {
      console.error("Error approving trainer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/dismiss-trainer/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get trainer info before dismissing
      const trainer = await storage.getUser(id);
      if (!trainer) {
        return res.status(404).json({ error: "Trainer not found" });
      }
      
      // Record dismissal history before deleting
      await storage.addApprovalHistory({
        targetType: "trainer",
        targetId: id,
        targetName: trainer.username,
        targetEmail: trainer.email || undefined,
        action: "dismissed",
        performedBy: req.user!.id,
        performedByName: req.user!.username,
        performedByRole: "admin",
      });
      
      const dismissed = await storage.dismissUser(id);
      if (!dismissed) {
        return res.status(404).json({ error: "Trainer not found" });
      }
      
      res.json({ 
        success: true, 
        message: `Trainer ${trainer.username} has been dismissed`,
      });
    } catch (error) {
      console.error("Error dismissing trainer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/approve-teacher/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const approvedBy = req.user!.id;
      const approvedByRole = "admin";
      
      const approvedTeacher = await storage.approveTeacher(id, approvedBy, approvedByRole);
      if (!approvedTeacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      // Record approval history
      await storage.addApprovalHistory({
        targetType: "teacher",
        targetId: id,
        targetName: approvedTeacher.name,
        targetEmail: approvedTeacher.email,
        action: "approved",
        performedBy: approvedBy,
        performedByName: req.user!.username,
        performedByRole: "admin",
      });
      
      const { password, ...sanitized } = approvedTeacher;
      res.json({ 
        success: true, 
        message: `Teacher ${approvedTeacher.name} has been approved by admin`,
        teacher: sanitized 
      });
    } catch (error) {
      console.error("Error approving teacher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/dismiss-teacher/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get teacher info before dismissing
      const teacher = await storage.getTeacher(id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      // Record dismissal history before deleting
      await storage.addApprovalHistory({
        targetType: "teacher",
        targetId: id,
        targetName: teacher.name,
        targetEmail: teacher.email,
        action: "dismissed",
        performedBy: req.user!.id,
        performedByName: req.user!.username,
        performedByRole: "admin",
      });
      
      const dismissed = await storage.dismissTeacher(id);
      if (!dismissed) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      res.json({ 
        success: true, 
        message: `Teacher ${teacher.name} has been dismissed`,
      });
    } catch (error) {
      console.error("Error dismissing teacher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approval history route
  app.get("/api/approval-history", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const history = await storage.getApprovalHistory(100);
      res.json(history);
    } catch (error) {
      console.error("Error getting approval history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approval routes for trainers
  app.get("/api/trainer/pending-teachers", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const pendingTeachers = await storage.getPendingTeachers();
      // Remove password from response
      const sanitized = pendingTeachers.map(({ password, ...teacher }) => teacher);
      res.json(sanitized);
    } catch (error) {
      console.error("Error getting pending teachers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/trainer/approve-teacher/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { id } = req.params;
      const approvedBy = req.user!.id;
      const approvedByRole = "trainer";

      const approvedTeacher = await storage.approveTeacher(id, approvedBy, approvedByRole);
      if (!approvedTeacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Record approval history
      await storage.addApprovalHistory({
        targetType: "teacher",
        targetId: id,
        targetName: approvedTeacher.name,
        targetEmail: approvedTeacher.email,
        action: "approved",
        performedBy: approvedBy,
        performedByName: req.user!.username,
        performedByRole: "trainer",
      });

      const { password, ...sanitized } = approvedTeacher;
      res.json({
        success: true,
        message: `Teacher ${approvedTeacher.name} has been approved by trainer`,
        teacher: sanitized
      });
    } catch (error) {
      console.error("Error approving teacher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/trainer/dismiss-teacher/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { id } = req.params;

      // Get teacher info before dismissing
      const teacher = await storage.getTeacher(id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Record dismissal history before deleting
      await storage.addApprovalHistory({
        targetType: "teacher",
        targetId: id,
        targetName: teacher.name,
        targetEmail: teacher.email,
        action: "dismissed",
        performedBy: req.user!.id,
        performedByName: req.user!.username,
        performedByRole: "trainer",
      });

      const dismissed = await storage.dismissTeacher(id);
      if (!dismissed) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      res.json({
        success: true,
        message: `Teacher ${teacher.name} has been dismissed`,
      });
    } catch (error) {
      console.error("Error dismissing teacher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer password reset endpoint for teachers in their batches
  const trainerResetPasswordSchema = z.object({
    teacherId: z.string().min(1, "Teacher ID required"),
    newPassword: z.string().trim().min(6, "Password must be at least 6 characters"),
  });


  app.post("/api/trainer/reset-teacher-password", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId, newPassword } = trainerResetPasswordSchema.parse(req.body);

      // Get the teacher
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update teacher's password
      const updatedTeacher = await storage.updateTeacherPassword(teacherId, hashedPassword);

      if (!updatedTeacher) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      // Trainers can only reset teacher passwords — do NOT sync to admin/trainer accounts
      res.json({
        success: true,
        message: `Password reset successful for teacher: ${updatedTeacher.name} (ID: ${updatedTeacher.teacherId})`
      });
    } catch (error) {
      console.error("Error resetting teacher password:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all training weeks (authenticated users only)
  app.get("/api/training-weeks", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const weeks = await storage.getAllTrainingWeeks();
      res.json(weeks);
    } catch (error) {
      console.error("Error getting training weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new training week (admin only)
  app.post("/api/training-weeks", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const validated = insertTrainingWeekSchema.parse(req.body);
      if (await blockCourseEdit(res, req.user, validated.courseId)) return;
      const week = await storage.createTrainingWeek(validated);
      res.json(week);
    } catch (error) {
      console.error("Error creating training week:", error);
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // Update a training week (admin only)
  app.patch("/api/training-weeks/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!await editableModule(res, req.user, req.params.id)) return;
      const validated = updateTrainingWeekSchema.parse({
        ...req.body,
        id: req.params.id,
      });
      // Moving a module to another course needs that course in scope too.
      if (validated.courseId !== undefined && await blockCourseEdit(res, req.user, validated.courseId)) return;
      const week = await storage.updateTrainingWeek(validated);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }
      res.json(week);
    } catch (error) {
      console.error("Error updating training week:", error);
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // Delete a training week (admin only)
  app.delete("/api/training-weeks/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!await editableModule(res, req.user, req.params.id)) return;
      // 🗑️ CACHE INVALIDATION: Delete all cached quizzes for this week
      await storage.deleteCachedQuizzesForWeek(req.params.id);
      console.log(`[CACHE] Invalidated all quiz caches for week: ${req.params.id}`);

      const success = await storage.deleteTrainingWeek(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Training week not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting training week:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reorder training weeks (admin only)
  app.post("/api/training-weeks/reorder", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, newPosition } = req.body;
      
      if (!weekId || typeof newPosition !== 'number') {
        return res.status(400).json({ error: "Invalid request: weekId and newPosition required" });
      }

      // Get all weeks
      const weeks = await storage.getAllTrainingWeeks();
      
      // Find the week to move
      const weekIndex = weeks.findIndex(w => w.id === weekId);
      if (weekIndex === -1) {
        return res.status(404).json({ error: "Training week not found" });
      }

      // Validate new position
      if (newPosition < 1 || newPosition > weeks.length) {
        return res.status(400).json({ error: `Invalid position: must be between 1 and ${weeks.length}` });
      }

      // Remove the week from its current position
      const [weekToMove] = weeks.splice(weekIndex, 1);
      
      // Insert at new position (newPosition - 1 for 0-based indexing)
      weeks.splice(newPosition - 1, 0, weekToMove);

      // Renumber all weeks sequentially. Every module whose number changes must be on a course the caller may edit (D2).
      const changed = weeks.filter((week, index) => week.weekNumber !== index + 1);
      for (const courseId of Array.from(new Set(changed.map((week) => week.courseId)))) {
        if (await blockCourseEdit(res, req.user, courseId)) return;
      }
      const updatePromises = weeks.map((week, index) => 
        storage.updateTrainingWeek({
          id: week.id,
          weekNumber: index + 1
        })
      );

      await Promise.all(updatePromises);

      // Return updated weeks
      const updatedWeeks = await storage.getAllTrainingWeeks();
      res.json(updatedWeeks);
    } catch (error) {
      console.error("Error reordering training weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get upload URL for object storage (admin only)
  app.post("/api/objects/upload", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log("[UPLOAD DEBUG] Generated presigned URL for file upload");
      res.json({ uploadURL });
    } catch (error) {
      console.error("[UPLOAD ERROR] Error getting upload URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Whether this deployment uploads straight from the browser to Vercel Blob (see shared/uploads.ts).
  app.get("/api/objects/upload-mode", isAuthenticated, isTrainer, (_req, res) => {
    res.json({ direct: directUploadsAvailable() });
  });

  // Signs a browser-direct Blob upload for a signed-in Trainer or Admin. Vercel also posts the upload-completed event
  // here without a session; handleUpload checks that event's signature itself, so this route has no session guard.
  app.post("/api/blob-upload", async (req, res) => {
    try {
      if (!directUploadsAvailable()) return res.status(503).json({ error: "Direct uploads are not set up here" });
      const { handleUpload } = await import("@vercel/blob/client");
      const result = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async () => {
          const role = req.isAuthenticated?.() ? req.user?.role : undefined;
          if (role !== "admin" && role !== "trainer") throw new Error("Sign in as a Trainer to upload");
          return {
            allowedContentTypes: UPLOAD_CONTENT_TYPES,
            maximumSizeInBytes: UPLOAD_MAX_BYTES,
            addRandomSuffix: true,
          };
        },
        onUploadCompleted: async () => {},
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Upload refused" });
    }
  });

  app.put("/api/local-objects/:id", express.raw({ type: "*/*", limit: "80mb" }), isAuthenticated, isTrainer, async (req, res) => {
    try {
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      await objectStorageService.saveLocalObject(req.params.id, data);
      res.sendStatus(200);
    } catch (error) {
      console.error("[UPLOAD ERROR] Local object save failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/local-objects/:id", async (req, res) => {
    try {
      const data = await objectStorageService.readLocalObject(req.params.id);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(data);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return res.sendStatus(404);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/training-weeks/:id/import-package", isAuthenticated, isTrainer, packageUpload.single("package"), async (req, res) => {
    try {
      const week = await editableModule(res, req.user, req.params.id);
      if (!week) return;
      const file = (req as any).file as { buffer?: Buffer; originalname?: string } | undefined;
      if (!file?.buffer) return res.status(400).json({ error: "Upload a .zip package" });
      const imported = lessonFromPackage(file.buffer, file.originalname || "package.zip");
      const newFile = {
        id: randomUUID(),
        fileName: imported.fileName,
        fileUrl: `lesson://${randomUUID()}`,
        fileSize: imported.fileSize,
        lessonHtml: imported.lessonHtml,
      };
      const updatedWeek = await storage.updateTrainingWeek({
        id: week.id,
        deckFiles: [...(week.deckFiles || []), newFile],
      });
      res.status(201).json(updatedWeek);
    } catch (error) {
      console.error("Package import failed:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Could not import package" });
    }
  });

  app.post("/api/training-weeks/:id/external-link", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { youtubeVideoId } = await import("@shared/youtube");
      const url = String(req.body?.url || "");
      const title = String(req.body?.title || "YouTube lesson").trim() || "YouTube lesson";
      const youtubeId = youtubeVideoId(url);
      if (!youtubeId) {
        return res.status(400).json({ error: "Paste a YouTube watch, share, or embed link." });
      }
      const week = await editableModule(res, req.user, req.params.id);
      if (!week) return;
      const newFile = {
        id: randomUUID(),
        fileName: title,
        fileUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
        fileSize: 0,
        youtubeId,
      };
      const updatedWeek = await storage.updateTrainingWeek(req.params.id, {
        deckFiles: [...(week.deckFiles || []), newFile],
      });
      res.status(201).json(updatedWeek);
    } catch (error) {
      console.error("YouTube lesson attach failed:", error);
      res.status(400).json({ error: "Could not add YouTube lesson" });
    }
  });

  // Add deck files after upload (admin only) - supports multiple files
  app.post("/api/training-weeks/:id/deck", isAuthenticated, isTrainer, async (req, res) => {
    try {
      console.log("[UPLOAD DEBUG] Request body:", JSON.stringify(req.body, null, 2));
      const { files } = req.body; // Expecting an array of {fileUrl, fileName, fileSize}
      
      if (!files || !Array.isArray(files) || files.length === 0) {
        console.log("[UPLOAD DEBUG] Invalid files array:", files);
        return res.status(400).json({ error: "Missing or invalid files array" });
      }

      console.log(`[UPLOAD DEBUG] Processing ${files.length} files for week ${req.params.id}`);

      const week = await editableModule(res, req.user, req.params.id);
      if (!week) return;

      // Process each file and add to the existing deck files
      const newDeckFiles = await Promise.all(files.map(async file => {
        const objectPath = objectStorageService.normalizeObjectEntityPath(file.fileUrl);
        console.log(`[UPLOAD DEBUG] Normalized ${file.fileUrl} -> ${objectPath}`);
        
        // Extract Table of Contents for PDF and PPTX files
        let toc = undefined;
        try {
          console.log(`[TOC] Extracting Table of Contents for ${file.fileName}...`);
          const fileBuffer = await objectStorageService.getObjectEntity(objectPath);
          const { extractTableOfContents } = await import('./tocExtractor');
          toc = await extractTableOfContents(fileBuffer, file.fileName);
          console.log(`[TOC] Extracted ${toc.length} entries for ${file.fileName}`);
        } catch (error) {
          console.error(`[TOC] Error extracting ToC for ${file.fileName}:`, error);
          // Continue without ToC if extraction fails
        }
        
        return {
          id: randomUUID(),
          fileName: file.fileName,
          fileUrl: objectPath,
          fileSize: file.fileSize,
          toc,
        };
      }));

      const currentDeckFiles = week.deckFiles || [];
      const updatedDeckFiles = [...currentDeckFiles, ...newDeckFiles];

      console.log(`[UPLOAD DEBUG] Current files: ${currentDeckFiles.length}, New files: ${newDeckFiles.length}, Total: ${updatedDeckFiles.length}`);

      const updatedWeek = await storage.updateTrainingWeek({
        id: req.params.id,
        deckFiles: updatedDeckFiles,
      });

      console.log("[UPLOAD DEBUG] Database updated successfully");
      
      // 🚀 PRE-CACHE: Generate quiz drafts in background (non-blocking)
      // Each draft is saved unapproved; Fellows see it only after a trainer or admin approves it (D5)
      setImmediate(async () => {
        try {
          const { generateSingleFileQuiz } = await import('./quizService');
        
          for (const file of newDeckFiles) {
            try {
              const cacheStartTime = Date.now();
              console.log(`[PRE-CACHE] 🔄 Starting quiz generation for: ${file.fileName}`);
            
              const questions = await generateSingleFileQuiz({
                fileUrl: file.fileUrl,
                fileName: file.fileName,
                competencyFocus: week.competencyFocus,
                objective: week.objective,
                numQuestions: 10,
                openEndedCount: 2,
              });

              await storage.saveCachedQuiz({
                weekId: req.params.id,
                deckFileId: file.id,
                questions,
                approved: false,
              });

              const cacheTime = Date.now() - cacheStartTime;
              console.log(`[PRE-CACHE] ✅ Cached ${questions.length} questions for ${file.fileName} in ${cacheTime}ms`);
            } catch (error) {
              console.error(`[PRE-CACHE] ❌ Failed to pre-cache quiz for ${file.fileName}:`, error);
            }
          }
        } catch (error) {
          console.error("[PRE-CACHE] ❌ Quiz service unavailable:", error);
        }
      });

      res.json({ week: updatedWeek });
    } catch (error) {
      console.error("[UPLOAD ERROR] Error adding deck files:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a specific deck file (admin only)
  app.delete("/api/training-weeks/:id/deck/:fileId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { id, fileId } = req.params;

      const week = await editableModule(res, req.user, id);
      if (!week) return;

      const currentDeckFiles = week.deckFiles || [];
      const updatedDeckFiles = currentDeckFiles.filter(file => file.id !== fileId);

      const updatedWeek = await storage.updateTrainingWeek({
        id,
        deckFiles: updatedDeckFiles,
      });

      // 🗑️ CACHE INVALIDATION: Delete cached quiz for this file
      await storage.deleteCachedQuiz(id, fileId);
      console.log(`[CACHE] Invalidated quiz cache for file: ${fileId}`);

      res.json({ week: updatedWeek });
    } catch (error) {
      console.error("Error deleting deck file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reorder deck files (admin only)
  app.post("/api/training-weeks/:id/deck/reorder", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { id } = req.params;
      const { fileIds } = req.body;

      if (!fileIds || !Array.isArray(fileIds)) {
        return res.status(400).json({ error: "Invalid request: fileIds array required" });
      }

      const week = await editableModule(res, req.user, id);
      if (!week) return;

      const currentDeckFiles = week.deckFiles || [];
      
      // Reorder files based on the provided fileIds order
      const reorderedFiles = fileIds
        .map(fileId => currentDeckFiles.find(f => f.id === fileId))
        .filter(f => f !== undefined);

      const updatedWeek = await storage.updateTrainingWeek({
        id,
        deckFiles: reorderedFiles,
      });

      res.json({ week: updatedWeek });
    } catch (error) {
      console.error("Error reordering deck files:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve uploaded files
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const localId = req.path.match(/\/objects\/local\/([0-9a-fA-F-]{36})/)?.[1];
      if (localId) {
        const data = await objectStorageService.readLocalObject(localId);
        res.setHeader("Content-Type", "application/octet-stream");
        return res.send(data);
      }
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Generate a public viewing URL for a file (authenticated users)
  app.get("/api/files/view-url", isAuthenticatedAny, async (req, res) => {
    try {
      const { fileUrl } = req.query;
      if (!fileUrl || typeof fileUrl !== 'string') {
        return res.status(400).json({ error: "fileUrl parameter required" });
      }

      const grant = signFileGrant(fileUrl);
      const encodedUrl = encodeURIComponent(fileUrl);
      const viewUrl = `/api/files/proxy?url=${encodedUrl}&exp=${grant.exp}&sig=${grant.sig}`;
      
      res.json({ viewUrl, expiresAt: grant.exp });
    } catch (error) {
      console.error("Error generating view URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Proxy file requests to make them publicly accessible for Office viewer
  app.get("/api/files/proxy", async (req, res) => {
    try {
      if (!fileRequestAllowed(req)) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url parameter required" });
      }

      const buffer = await objectStorageService.getObjectEntity(url);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Content-Disposition", "inline");
      return res.send(buffer);
    } catch (error) {
      console.error("Error proxying file:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Convert DOCX to HTML for viewing in the app
  app.get("/api/files/convert-to-html", async (req, res) => {
    try {
      if (!fileRequestAllowed(req)) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url parameter required" });
      }

      const buffer = await objectStorageService.getObjectEntity(url);
      
      const result = await mammoth.convertToHtml({ buffer });
      
      res.setHeader('Content-Type', 'application/json');
      res.json({ 
        html: sanitizeLessonHtml(result.value),
        messages: result.messages 
      });
    } catch (error) {
      console.error("Error converting document to HTML:", error);
      res.status(500).json({ error: "Failed to convert document" });
    }
  });

  // Convert PPTX to PDF for HD viewing (authenticated users - teachers and trainers)
  app.get("/api/files/convert-to-pdf", (req, res, next) => {
    // Allow both trainer and teacher authentication
    const isTrainerAuth = req.isAuthenticated?.() || req.user;
    const isTeacherAuth = (req.session as any)?.teacherId;
    if (isTrainerAuth || isTeacherAuth) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  }, async (req, res) => {
    const tempFiles: string[] = [];
    
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url parameter required" });
      }

      const buffer = await objectStorageService.getObjectEntity(url);

      // Create temporary files for conversion
      const tempId = randomUUID();
      const tempDir = tmpdir();
      const inputPath = join(tempDir, `${tempId}.pptx`);
      const outputDir = join(tempDir, tempId);
      const outputPath = join(outputDir, `${tempId}.pdf`);
      
      tempFiles.push(inputPath, outputPath);

      // Write input file
      await writeFile(inputPath, buffer);

      // Create output directory
      await mkdir(outputDir, { recursive: true });

      const libreOfficePath = [
        process.env.LIBREOFFICE_PATH,
        "/nix/store/j261ykwr6mxvai0v22sa9y6w421p30ay-libreoffice-7.6.7.2-wrapped/bin/soffice",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
      ].find((candidate) => candidate && existsSync(candidate)) || "soffice";
      const command = `"${libreOfficePath}" --headless --convert-to pdf --outdir ${outputDir} ${inputPath}`;
      
      await execAsync(command, { timeout: 60000 });

      let pdfPath = outputPath;
      if (!existsSync(pdfPath)) {
        const produced = (await readdir(outputDir)).find((name) => name.toLowerCase().endsWith(".pdf"));
        if (produced) {
          pdfPath = join(outputDir, produced);
          tempFiles.push(pdfPath);
        }
      }

      if (!existsSync(pdfPath)) {
        return res.status(422).json({ error: "This presentation could not be converted. Upload the PowerPoint file again." });
      }

      const pdfBuffer = await readFile(pdfPath);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error converting file to PDF:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "File not found" });
      }
      return res.status(500).json({ error: "Conversion failed" });
    } finally {
      // Clean up temporary files
      for (const file of tempFiles) {
        try {
          await unlink(file);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  });

  // Content Items API - for LMS-style course content

  /** A content item's module, when the caller may edit it (D2). Otherwise answers 404 or 403 and returns null. */
  async function editableContentItem(req: Request, res: Response) {
    const [item] = await db.select({ weekId: contentItems.weekId }).from(contentItems).where(eq(contentItems.id, req.params.id));
    if (!item) {
      res.status(404).json({ error: "Content item not found" });
      return null;
    }
    return editableModule(res, req.user, item.weekId);
  }

  // Get all content items for a week with user progress (authenticated users)
  app.get("/api/training-weeks/:weekId/content", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;
      
      const items = await storage.getContentItemsWithProgress(weekId, userId);
      res.json(items);
    } catch (error) {
      console.error("Error getting content items:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a content item (admin only)
  app.post("/api/training-weeks/:weekId/content", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!await editableModule(res, req.user, req.params.weekId)) return;
      const item = await storage.createContentItem({ ...req.body, weekId: req.params.weekId });
      res.json(item);
    } catch (error) {
      console.error("Error creating content item:", error);
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // Update a content item (admin only)
  app.patch("/api/content-items/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!await editableContentItem(req, res)) return;
      // Moving an item to another module needs that module in scope too.
      if (req.body?.weekId && !await editableModule(res, req.user, String(req.body.weekId))) return;
      const item = await storage.updateContentItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Content item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating content item:", error);
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // Delete a content item (admin only)
  app.delete("/api/content-items/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!await editableContentItem(req, res)) return;
      const success = await storage.deleteContentItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Content item not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting content item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User Progress API

  // Save or update user progress for a content item
  app.post("/api/progress", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { contentItemId, status, videoProgress, completedAt } = req.body;
      
      const progress = await storage.saveUserProgress({
        userId,
        contentItemId,
        status,
        videoProgress,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      });
      
      res.json(progress);
    } catch (error) {
      console.error("Error saving user progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get overall progress for a week (percentage complete)
  app.get("/api/training-weeks/:weekId/progress", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;
      
      const progressData = await storage.getWeekProgress(weekId, userId);
      res.json(progressData);
    } catch (error) {
      console.error("Error getting week progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Deck File Progress API - for tracking progress on presentation files

  // Get deck files for a week with user progress
  app.get("/api/training-weeks/:weekId/deck-files", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;
      
      const files = await storage.getDeckFilesWithProgress(weekId, userId);
      res.json(files);
    } catch (error) {
      console.error("Error getting deck files:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Save or update deck file progress
  app.post("/api/deck-progress", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId, deckFileId, status, completedAt } = req.body;
      
      const progress = await storage.saveDeckFileProgress({
        userId,
        weekId,
        deckFileId,
        status,
        completedAt: completedAt ? new Date(completedAt) : undefined,
      });
      
      res.json(progress);
    } catch (error) {
      console.error("Error saving deck file progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get overall deck file progress for a week
  app.get("/api/training-weeks/:weekId/deck-progress", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;
      
      const progressData = await storage.getWeekDeckProgress(weekId, userId);
      res.json(progressData);
    } catch (error) {
      console.error("Error getting deck progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Security API routes
  
  // Log security violations (screenshot attempts, etc.)
  app.post("/api/security/log-violation", isAuthenticated, async (req, res) => {
    try {
      const { weekId, violationType, timestamp, userAgent } = req.body;
      
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const violation = await storage.logSecurityViolation({
        userId: req.user.id,
        weekId: weekId || null,
        violationType: violationType || 'unknown',
        userAgent: userAgent || null,
      });

      console.log(`[SECURITY] User ${req.user.username} - ${violationType} detected on week ${weekId}`);
      
      res.json({ success: true, id: violation.id });
    } catch (error) {
      console.error("Error logging security violation:", error);
      res.status(500).json({ error: "Failed to log security violation" });
    }
  });

  // Quiz API routes

  // Generate quiz questions for a training week (authenticated users)
  app.post("/api/training-weeks/:weekId/generate-quiz", isAuthenticated, async (req, res) => {
    try {
      console.log("[QUIZ] Starting quiz generation for week:", req.params.weekId);
      const { weekId } = req.params;
      
      const week = await storage.getTrainingWeek(weekId);
      console.log("[QUIZ] Retrieved week:", week ? week.id : "not found");
      
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

      if (!week.deckFiles || week.deckFiles.length === 0) {
        console.log("[QUIZ] No deck files found");
        return res.status(400).json({ error: "No files available for quiz generation" });
      }

      console.log("[QUIZ] Found", week.deckFiles.length, "files");

      // Import the quiz service
      const { generateQuizQuestions } = await import('./quizService');

      const fileUrls = week.deckFiles.map(file => ({
        url: file.fileUrl,
        name: file.fileName,
      }));

      console.log("[QUIZ] Generating questions from files:", fileUrls.map(f => f.name).join(', '));
      
      const questions = await generateQuizQuestions({
        fileUrls,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions: 7,
      });

      console.log("[QUIZ] Successfully generated", questions.length, "questions");
      res.json({ questions });
    } catch (error) {
      console.error("[QUIZ] Error generating quiz:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate quiz" });
    }
  });

  // Submit quiz answers and save attempt
  app.post("/api/training-weeks/:weekId/submit-quiz", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;
      const { questions, answers } = req.body;

      if (!questions || !Array.isArray(questions) || !answers || typeof answers !== 'object') {
        return res.status(400).json({ error: "Invalid quiz submission" });
      }

      // Calculate score
      let score = 0;
      questions.forEach((q: any) => {
        if (answers[q.id] === q.correctAnswer) {
          score++;
        }
      });

      const totalQuestions = questions.length;
      const passed = score >= Math.ceil(totalQuestions * 0.7) ? "yes" : "no"; // 70% pass rate

      const attempt = await storage.saveQuizAttempt({
        userId,
        weekId,
        questions,
        answers,
        score,
        totalQuestions,
        passed,
      });

      res.json({ 
        attempt,
        score,
        totalQuestions,
        passed: passed === "yes",
        percentage: Math.round((score / totalQuestions) * 100),
      });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      res.status(500).json({ error: "Failed to submit quiz" });
    }
  });

  // Get latest quiz attempt for a week
  app.get("/api/training-weeks/:weekId/quiz-attempt", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { weekId } = req.params;

      const attempt = await storage.getLatestQuizAttempt(weekId, userId);
      res.json(attempt || null);
    } catch (error) {
      console.error("Error getting quiz attempt:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check if user has passed the quiz
  app.get("/api/training-weeks/:weekId/quiz-passed", isAuthenticatedAny, async (req, res) => {
    try {
      const userId = req.user?.id || req.teacherId!;
      const { weekId } = req.params;

      const passed = await storage.hasPassedQuiz(weekId, userId);
      res.json({ passed });
    } catch (error) {
      console.error("Error checking quiz status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // File-level quiz endpoints (modular approach)

  // Generate quiz for a specific file (with pre-caching for instant delivery)
  app.post("/api/training-weeks/:weekId/files/:fileId/generate-quiz", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const startTime = Date.now();
      console.log("[FILE-QUIZ] Starting quiz generation for file:", req.params.fileId);
      const { weekId, fileId } = req.params;
      const { numQuestions = 5, force = false } = req.body;

      const week = await editableModule(res, req.user, weekId);
      if (!week) return;

      const file = week.deckFiles?.find(f => f.id === fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // 🚀 CACHE HIT: Check if quiz questions are already cached with matching question count (skip if force regenerating)
      if (!force) {
        const cachedQuiz = await storage.getCachedQuiz(weekId, fileId);
        if (cachedQuiz && cachedQuiz.questions.length >= numQuestions) {
          const cacheTime = Date.now() - startTime;
          console.log(`[FILE-QUIZ] 🎯 CACHE HIT! Instant retrieval in ${cacheTime}ms for ${file.fileName}`);
          return res.json({
            questions: cachedQuiz.questions.slice(0, numQuestions),
            cached: true,
            approved: cachedQuiz.approved,
          });
        }
      } else {
        console.log(`[FILE-QUIZ] 🔄 Force regenerating quiz for ${file.fileName} with ${numQuestions} questions`);
      }

      // ❌ CACHE MISS: Generate quiz on-demand
      console.log("[FILE-QUIZ] ⏳ Cache miss, generating quiz for:", file.fileName, "with", numQuestions, "questions");

      const { generateSingleFileQuiz } = await import('./quizService');
      
      const questions = await generateSingleFileQuiz({
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions: numQuestions,
      });

      // Save to cache for future instant retrieval
      console.log(`[FILE-QUIZ] 💾 About to save ${questions.length} questions to cache for weekId=${weekId}, fileId=${fileId}`);
      // A draft: Fellows see it only after a trainer or admin approves it (D5).
      const savedQuiz = await storage.saveCachedQuiz({
        weekId,
        deckFileId: fileId,
        questions,
        approved: false,
      });
      console.log(`[FILE-QUIZ] ✅ Successfully saved quiz, cached questions count:`, savedQuiz.questions.length);

      const totalTime = Date.now() - startTime;
      console.log(`[FILE-QUIZ] ✅ Generated and cached ${questions.length} questions in ${totalTime}ms`);
      res.json({ questions, cached: false, approved: false });
    } catch (error) {
      console.error("[FILE-QUIZ] Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate quiz" });
    }
  });

  // Get quiz cache status for all files in a week (admin view)
  app.get("/api/training-weeks/:weekId/quiz-status", isAuthenticated, async (req, res) => {
    try {
      const week = await storage.getTrainingWeek(req.params.weekId);
      if (!week || !week.deckFiles) return res.json({});
      const result: Record<string, { generated: boolean; questionCount: number; approved: boolean; questions?: any[] }> = {};
      for (const file of week.deckFiles) {
        const cached = await storage.getCachedQuiz(req.params.weekId, file.id);
        result[file.id] = {
          generated: !!(cached && cached.questions.length > 0),
          questionCount: cached?.questions.length ?? 0,
          approved: cached?.approved ?? false,
          questions: cached?.questions ?? [],
        };
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Edit quiz questions for a file (admin/trainer)
  app.patch("/api/training-weeks/:weekId/files/:fileId/quiz", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, fileId } = req.params;
      const { questions } = req.body;
      if (!Array.isArray(questions)) return res.status(400).json({ error: "questions must be an array" });
      if (!await editableModule(res, req.user, weekId)) return;
      let updated = await storage.updateCachedQuizQuestions(weekId, fileId, questions);
      if (!updated) {
        updated = await storage.saveCachedQuiz({
          weekId,
          deckFileId: fileId,
          questions,
          approved: false,
        });
      }
      res.json({ success: true, questions: updated.questions });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve quiz for a file — makes it visible to teachers
  app.post("/api/training-weeks/:weekId/files/:fileId/quiz/approve", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, fileId } = req.params;
      if (!await editableModule(res, req.user, weekId)) return;
      const updated = await storage.approveCachedQuiz(weekId, fileId);
      if (!updated) return res.status(404).json({ error: "No quiz found for this file" });
      res.json({ success: true, approved: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Bulk generate quizzes for all files missing a quiz (admin — background)
  app.post("/api/admin/generate-missing-quizzes", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const weeks = await storage.getAllTrainingWeeks();
      const missing: Array<{ weekId: string; fileId: string; fileName: string }> = [];

      for (const week of weeks) {
        if (!week.deckFiles || week.deckFiles.length === 0) continue;
        for (const file of week.deckFiles) {
          const cached = await storage.getCachedQuiz(week.id, file.id);
          if (!cached || cached.questions.length === 0) {
            missing.push({ weekId: week.id, fileId: file.id, fileName: file.fileName });
          }
        }
      }

      res.json({ queued: missing.length, files: missing.map(m => m.fileName) });

      // Run generation in background after responding
      setImmediate(async () => {
        const { generateSingleFileQuiz } = await import('./quizService');
        for (const item of missing) {
          try {
            const week = weeks.find(w => w.id === item.weekId)!;
            const file = week.deckFiles!.find(f => f.id === item.fileId)!;
            const questions = await generateSingleFileQuiz({
              fileUrl: file.fileUrl,
              fileName: file.fileName,
              competencyFocus: week.competencyFocus,
              objective: week.objective,
              numQuestions: 10,
              openEndedCount: 2,
            });
            await storage.saveCachedQuiz({ weekId: item.weekId, deckFileId: item.fileId, questions, approved: false });
            console.log(`[BULK-GEN] ✅ Generated quiz for ${item.fileName}`);
          } catch (err) {
            console.error(`[BULK-GEN] ❌ Failed for ${item.fileName}:`, err);
          }
        }
        console.log(`[BULK-GEN] Done. Processed ${missing.length} files.`);
      });
    } catch (error) {
      console.error("[BULK-GEN] Error:", error);
      res.status(500).json({ error: "Failed to start bulk generation" });
    }
  });

  // Force-regenerate quiz for a file (admin — bypasses cache)
  app.post("/api/training-weeks/:weekId/files/:fileId/regenerate-quiz-admin", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, fileId } = req.params;
      const week = await editableModule(res, req.user, weekId);
      if (!week) return;
      const file = week.deckFiles?.find(f => f.id === fileId);
      if (!file) return res.status(404).json({ error: "File not found" });

      // Delete existing cache entry
      await storage.deleteCachedQuiz(weekId, fileId);

      const { generateSingleFileQuiz } = await import('./quizService');
      const questions = await generateSingleFileQuiz({
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions: 10,
        openEndedCount: 2,
      });
      await storage.saveCachedQuiz({ weekId, deckFileId: fileId, questions, approved: false });
      res.json({ success: true, questionCount: questions.length, approved: false });
    } catch (error) {
      console.error("[ADMIN-REGEN] Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to regenerate quiz" });
    }
  });

  // Submit quiz for a specific file
  app.post("/api/training-weeks/:weekId/files/:fileId/submit-quiz", isAuthenticatedAny, async (req, res) => {
    try {
      const userId = req.user?.id;
      const teacherId = req.teacherId;
      const { weekId, fileId } = req.params;

      if (!req.body?.answers || typeof req.body.answers !== 'object') {
        return res.status(400).json({ error: "Invalid quiz submission" });
      }

      // Defensive check: Verify the file belongs to this week
      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }
      // A teacher needs an open cohort for the course and an unlocked module (C3, C5).
      if (await blockTeacherWeekQuiz(res, teacherId, week)) return;
      const fileExists = week.deckFiles?.some(f => f.id === fileId);
      if (!fileExists) {
        return res.status(400).json({ error: "File does not belong to this training week" });
      }

      // Grade against the stored quiz; any questions in the body are ignored.
      const result = gradeLessonQuiz({
        cached: await storage.getCachedQuiz(weekId, fileId),
        answers: req.body.answers,
        staff: !teacherId && isAcademyStaff(req.user),
      });
      if ("error" in result) return res.status(result.status).json({ error: result.error });
      const { questions, answers, graded, review } = result;
      const passed = graded.passed ? "yes" : "no";

      const attempt = await storage.saveQuizAttempt({
        userId: userId || null,
        teacherId: teacherId || null,
        weekId,
        deckFileId: fileId,
        questions,
        answers,
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        passed,
      });

      if (teacherId && graded.passed) {
        await storage.upsertTeacherContentProgress({
          teacherId,
          weekId,
          deckFileId: fileId,
          status: "completed",
          completedAt: new Date(),
        });
        if (week.deckFiles) {
          const currentIndex = week.deckFiles.findIndex(f => f.id === fileId);
          if (currentIndex >= 0 && currentIndex < week.deckFiles.length - 1) {
            await storage.upsertTeacherContentProgress({
              teacherId,
              weekId,
              deckFileId: week.deckFiles[currentIndex + 1].id,
              status: "available",
            });
          }
        }
        if (week.courseId) {
          try {
            await storage.syncTeacherCourseCompletion(teacherId, week.courseId);
            await storage.tryAutoGenerateCertificate(teacherId, week.courseId);
          } catch (syncError) {
            console.error("Error syncing course completion after quiz:", syncError);
          }
        }
      }

      if (teacherId) {
        await storage.refreshTeacherReportCard(teacherId);
      }

      res.json({
        attempt: teacherId ? learnerQuiz(attempt) : attempt,
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        passed: graded.passed,
        percentage: graded.percentage,
        // The results screen reviews answers only after a pass.
        review: graded.passed ? review : [],
      });
    } catch (error) {
      console.error("[FILE-QUIZ] Submission error:", error);
      res.status(500).json({ error: "Failed to submit quiz" });
    }
  });

  // Get quiz progress for all files in a week
  app.get("/api/training-weeks/:weekId/file-quiz-progress", isAuthenticatedAny, async (req, res) => {
    try {
      const userId = req.user?.id || req.teacherId!;
      const { weekId } = req.params;

      const progress = await storage.getFileQuizProgress(weekId, userId);
      res.json(progress);
    } catch (error) {
      console.error("[FILE-QUIZ] Progress error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get existing quiz for a specific file (for teachers to attempt pre-generated quizzes)
  app.get("/api/training-weeks/:weekId/files/:fileId/quiz", isAuthenticatedAny, async (req, res) => {
    try {
      const { weekId, fileId } = req.params;

      console.log(`[FILE-QUIZ] 🔍 Fetching quiz for weekId=${weekId}, fileId=${fileId}`);
      
      // First, check cache. A teacher session is never staff, even if a staff login shares the session.
      const isAdminOrTrainer = !req.teacherId && !!(req.user && (req.user.role === 'admin' || req.user.role === 'trainer'));
      const cachedQuiz = await storage.getCachedQuiz(weekId, fileId);
      if (cachedQuiz && cachedQuiz.questions.length > 0) {
        // Teachers get an approved quiz without answers, or nothing; admins/trainers can always preview.
        const view = lessonQuizForViewer(cachedQuiz, isAdminOrTrainer);
        if (!view) {
          console.log(`[FILE-QUIZ] ⏳ Quiz not yet approved for teachers`);
          res.status(404).json({ error: "No quiz available for this file" });
          return;
        }
        console.log(`[FILE-QUIZ] ✅ Found cached quiz with ${cachedQuiz.questions.length} questions`);
        res.json(view);
        return;
      }

      // Submit grades teachers only against an approved cached quiz, so the fallback below is staff-only.
      if (!isAdminOrTrainer) {
        res.status(404).json({ error: "No quiz available for this file" });
        return;
      }

      // Fallback: check assigned quizzes for this file/week
      console.log(`[FILE-QUIZ] 🔄 No cache found, checking assigned quizzes...`);
      const quizzes = await db
        .select()
        .from(assignedQuizzes)
        .where(
          and(
            eq(assignedQuizzes.weekId, weekId),
            eq(assignedQuizzes.deckFileId, fileId)
          )
        )
        .limit(1);

      if (quizzes.length > 0) {
        const quiz = quizzes[0];
        const questions = JSON.parse(quiz.questions as any);
        console.log(`[FILE-QUIZ] ✅ Found assigned quiz with ${questions.length} questions`);
        res.json({ questions });
        return;
      }
      
      // No quiz available
      console.log(`[FILE-QUIZ] ❌ No quiz found for weekId=${weekId}, fileId=${fileId}`);
      res.status(404).json({ error: "No quiz available for this file" });
    } catch (error) {
      console.error("[FILE-QUIZ] Get quiz error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check if user has passed quiz for a specific file
  app.get("/api/training-weeks/:weekId/files/:fileId/quiz-passed", isAuthenticatedAny, async (req, res) => {
    try {
      const userId = req.user?.id || req.teacherId!;
      const { weekId, fileId } = req.params;

      const passed = await storage.hasPassedFileQuiz(weekId, fileId, userId);
      res.json({ passed });
    } catch (error) {
      console.error("[FILE-QUIZ] Check passed error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================================
  // BATCH MANAGEMENT ROUTES (Trainer only)
  // ============================================================================

  // Get all batches (optionally filter by creator)
  app.get("/api/batches", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batchesList = await storage.getAllBatches(req.user?.role === "trainer" ? req.user.id : undefined);
      res.json(batchesList);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new batch (admin only)
  app.post("/api/batches", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Batch name is required" });
      let trainerId: string | null = null;
      if (req.body.trainerId) {
        const trainer = await storage.getUser(String(req.body.trainerId));
        if (!trainer || trainer.role !== "trainer") {
          return res.status(400).json({ error: "Invalid trainer ID" });
        }
        trainerId = trainer.id;
      }
      const batch = await storage.createBatch({
        name,
        description: req.body.description,
        stage: req.body.stage || null,
        track: req.body.track === "secondary" ? "secondary" : req.body.track === "primary" ? "primary" : null,
        createdBy: req.user!.id,
        trainerId,
      });
      res.status(201).json(batch);
    } catch (error) {
      console.error("Error creating batch:", error);
      res.status(500).json({ error: "Failed to create batch" });
    }
  });

  // Get a specific batch with teachers
  app.get("/api/batches/:batchId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership - only admins can access any batch, trainers only their own
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      res.json({ ...batch, teachers: teachers.map(publicFellow) });
    } catch (error) {
      console.error("Error fetching batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a cohort. Only an admin adds or removes cohorts.
  app.delete("/api/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership - only admins can delete any batch, trainers only their own
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteBatch(req.params.batchId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const existing = await storage.getBatch(req.params.batchId);
      if (!existing) return res.status(404).json({ error: "Batch not found" });
      const [updated] = await db.update(batches).set({
        name: req.body.name ? String(req.body.name) : existing.name,
        description: req.body.description !== undefined ? req.body.description : existing.description,
        stage: req.body.stage !== undefined ? req.body.stage : existing.stage,
        track: req.body.track !== undefined ? req.body.track : existing.track,
      }).where(eq(batches.id, existing.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating batch:", error);
      res.status(500).json({ error: "Failed to update batch" });
    }
  });

  // Assign trainer to batch (Admin only)
  app.put("/api/batches/:batchId/trainer", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { trainerId } = req.body;
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      // Verify trainer exists and is actually a trainer
      if (trainerId) {
        const trainer = await storage.getUser(trainerId);
        if (!trainer || trainer.role !== "trainer") {
          return res.status(400).json({ error: "Invalid trainer ID" });
        }
      }
      
      const updated = await storage.assignTrainerToBatch(req.params.batchId, trainerId || null);
      res.json(updated);
    } catch (error) {
      console.error("Error assigning trainer to batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/batches/:batchId/access", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const existing = await storage.getBatch(req.params.batchId);
      if (!existing) return res.status(404).json({ error: "Batch not found" });
      const patch: { status?: string; quizzesStatus?: string } = {};
      if (req.body.status !== undefined) {
        if (req.body.status !== "open" && req.body.status !== "closed") {
          return res.status(400).json({ error: "Status must be open or closed" });
        }
        patch.status = req.body.status;
      }
      if (req.body.quizzesStatus !== undefined) {
        if (req.body.quizzesStatus !== "open" && req.body.quizzesStatus !== "stopped") {
          return res.status(400).json({ error: "Quizzes must be open or stopped" });
        }
        patch.quizzesStatus = req.body.quizzesStatus;
      }
      if (!patch.status && !patch.quizzesStatus) {
        return res.status(400).json({ error: "Nothing to update" });
      }
      const [updated] = await db.update(batches).set(patch).where(eq(batches.id, existing.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating cohort access:", error);
      res.status(500).json({ error: "Failed to update cohort" });
    }
  });

  app.patch("/api/assigned-quizzes/:quizId/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.body.status === "stopped" ? "stopped" : req.body.status === "open" ? "open" : null;
      if (!status) return res.status(400).json({ error: "Status must be open or stopped" });
      const [updated] = await db
        .update(assignedQuizzes)
        .set({ status })
        .where(eq(assignedQuizzes.id, req.params.quizId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Quiz not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating quiz status:", error);
      res.status(500).json({ error: "Failed to update quiz" });
    }
  });

  // Get all trainers (Admin only - for dropdown)
  app.get("/api/trainers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const trainers = await storage.getUsersByRole("trainer");
      // Return only safe fields (no password)
      const safeTrainers = trainers.map(t => ({
        id: t.id,
        username: t.username,
        email: t.email,
        role: t.role,
      }));
      res.json(safeTrainers);
    } catch (error) {
      console.error("Error fetching trainers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Search teachers by name, email, or ID (for enrollment lookup)
  app.get("/api/teachers/search", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) {
        const all = await storage.getApprovedTeachers();
        return res.json(all);
      }
      // Try numeric ID first
      const numId = parseInt(q, 10);
      if (!isNaN(numId)) {
        const t = await storage.getTeacherByTeacherId(numId);
        return res.json(t ? [t] : []);
      }
      // Try email
      if (q.includes("@")) {
        const t = await storage.getTeacherByEmail(q);
        return res.json(t ? [t] : []);
      }
      // Search by name
      const results = await storage.getTeacherByName(q);
      return res.json(results);
    } catch (error) {
      console.error("Error searching teachers:", error);
      res.status(500).json({ error: "Failed to search teachers" });
    }
  });

  // Add teacher to batch by teacherId, name, or email
  app.post("/api/batches/:batchId/teachers", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { teacherId, teacherEmail, teacherName } = req.body;
      let teacher;

      if (teacherId !== undefined && teacherId !== "") {
        // Numeric ID lookup
        teacher = await storage.getTeacherByTeacherId(Number(teacherId));
        if (!teacher) return res.status(404).json({ error: "Teacher not found with that ID" });
      } else if (teacherEmail) {
        teacher = await storage.getTeacherByEmail(String(teacherEmail).trim());
        if (!teacher) return res.status(404).json({ error: "Teacher not found with that email" });
      } else if (teacherName) {
        const matches = await storage.getTeacherByName(String(teacherName).trim());
        if (matches.length === 0) return res.status(404).json({ error: "No teacher found with that name" });
        if (matches.length > 1) return res.status(400).json({ error: "Multiple teachers match that name", matches: matches.map(t => ({ id: t.teacherId, name: t.name, email: t.email })) });
        teacher = matches[0];
      } else {
        return res.status(400).json({ error: "Provide teacherId, teacherEmail, or teacherName" });
      }

      const already = await storage.getTeachersInBatch(req.params.batchId);
      if (already.some((row) => row.id === teacher.id)) {
        return res.status(200).json({ message: "Teacher already in batch", teacher: { id: teacher.teacherId, name: teacher.name } });
      }

      await storage.addTeacherToBatch({
        batchId: req.params.batchId,
        teacherId: teacher.id,
      });

      await notifyTeacher(
        teacher.id,
        "You're in",
        `You have been added to ${batch.name}. Open your dashboard to continue learning.`,
        "general",
        { batchId: batch.id },
      );

      res.status(201).json({ message: "Teacher added to batch", teacher: { id: teacher.teacherId, name: teacher.name } });
    } catch (error) {
      console.error("Error adding teacher to batch:", error);
      res.status(500).json({ error: "Failed to add teacher to batch" });
    }
  });

  // Bulk add teachers to batch
  app.post("/api/batches/:batchId/teachers/bulk", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { teacherIds } = req.body; // Array of teacher UUID ids (not numeric)
      if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
        return res.status(400).json({ error: "teacherIds must be a non-empty array" });
      }

      let added = 0, skipped = 0;
      const errors: string[] = [];

      for (const tid of teacherIds) {
        try {
          await storage.addTeacherToBatch({ batchId: req.params.batchId, teacherId: tid });
          added++;
          await notifyTeacher(
            tid,
            "You're in",
            `You have been added to ${batch.name}. Open your dashboard to continue learning.`,
            "general",
            { batchId: batch.id },
          );
        } catch (err: any) {
          // Unique constraint violation = already enrolled
          if (err?.code === "23505" || String(err?.message).includes("duplicate")) {
            skipped++;
          } else {
            errors.push(`Teacher ${tid}: ${err?.message || "unknown error"}`);
          }
        }
      }

      res.json({ added, skipped, errors });
    } catch (error) {
      console.error("Error bulk adding teachers:", error);
      res.status(500).json({ error: "Failed to bulk add teachers" });
    }
  });

  // Remove teacher from batch
  app.delete("/api/batches/:batchId/teachers/:teacherId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.removeTeacherFromBatch(
        req.params.batchId,
        req.params.teacherId
      );
      if (!deleted) {
        return res.status(404).json({ error: "Teacher not in batch" });
      }
      res.sendStatus(204);
    } catch (error) {
      console.error("Error removing teacher from batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================================
  // QUIZ ASSIGNMENT ROUTES (Trainer only)
  // ============================================================================

  // Generate and assign quiz to a batch
  app.post("/api/batches/:batchId/assign-quiz", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { weekId, title, description } = req.body;
      // Checkpoint quiz: fixed at 25 questions (20 MCQ + 5 open-ended)
      const numQuestions = 25;
      const openEndedCount = 5;

      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

      const manualQuestions = Array.isArray(req.body?.questions)
        ? normalizeManualQuestions(req.body.questions)
        : null;
      if (manualQuestions && manualQuestions.length === 0) {
        return res.status(400).json({ error: "Add at least one valid question. Each choice needs options and a correct answer." });
      }
      if (!manualQuestions && (!week.deckFiles || week.deckFiles.length === 0)) {
        return res.status(400).json({ error: "No files available for quiz generation" });
      }

      let questions = manualQuestions;
      if (!questions) {
        const { generateQuizQuestions } = await import('./quizService');
        const fileUrls = (week.deckFiles || []).map(file => ({
          url: file.fileUrl,
          name: file.fileName,
        }));
        questions = await generateQuizQuestions({
          fileUrls,
          competencyFocus: week.competencyFocus,
          objective: week.objective,
          numQuestions,
          openEndedCount,
        });
      }

      // Create assigned quiz
      const audience = await resolveQuizAudience(req.params.batchId, req.body?.teacherIds);
      if (audience.error) return res.status(400).json({ error: audience.error });

      const assignedQuiz = await storage.createAssignedQuiz({
        batchId: req.params.batchId,
        weekId,
        title,
        description,
        numQuestions: questions.length,
        passMark: passMarkOf(req.body?.passMark),
        questions,
        assignedBy: req.user!.id,
        dueDate: parseDeadline(req.body?.dueDate),
      });
      await storage.replaceQuizAudience(assignedQuiz.id, audience.teacherIds);

      res.status(201).json({ ...assignedQuiz, teacherIds: audience.teacherIds });
      notifyQuizTeachers(
        req.params.batchId,
        audience.teacherIds,
        "A quiz is ready",
        `${title || "A module quiz"} is ready for ${batch.name}. Open your exams to write it.`,
      ).catch((error) => console.error("Quiz ready notice failed:", error));
    } catch (error) {
      console.error("Error assigning quiz:", error);
      res.status(500).json({ error: "Failed to assign quiz" });
    }
  });

  // Generate and assign file quiz to a batch
  app.post("/api/batches/:batchId/assign-file-quiz", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { weekId, fileId, title, description, numQuestions = 5 } = req.body;
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

      const manualQuestions = Array.isArray(req.body?.questions)
        ? normalizeManualQuestions(req.body.questions)
        : null;
      if (manualQuestions && manualQuestions.length === 0) {
        return res.status(400).json({ error: "Add at least one valid question. Each choice needs options and a correct answer." });
      }
      if (!manualQuestions && (!week.deckFiles || week.deckFiles.length === 0)) {
        return res.status(400).json({ error: "No files available for quiz generation" });
      }

      const selectedFile = manualQuestions
        ? (week.deckFiles || []).find(file => file.id === fileId) || { id: fileId, fileName: title || "Lesson" }
        : (week.deckFiles || []).find(file => file.id === fileId);
      if (!selectedFile) {
        return res.status(404).json({ error: "File not found in this training week" });
      }

      let questions = manualQuestions;
      if (!questions) {
        const { generateQuizQuestions } = await import('./quizService');
        const fileUrls = [{
          url: selectedFile.fileUrl,
          name: selectedFile.fileName,
        }];
        questions = await generateQuizQuestions({
          fileUrls,
          competencyFocus: week.competencyFocus,
          objective: week.objective,
          numQuestions,
        });
      }

      const audience = await resolveQuizAudience(req.params.batchId, req.body?.teacherIds);
      if (audience.error) return res.status(400).json({ error: audience.error });

      const assignedQuiz = await storage.createAssignedQuiz({
        batchId: req.params.batchId,
        weekId,
        deckFileId: fileId,
        fileName: selectedFile.fileName,
        title,
        description,
        numQuestions: questions.length,
        passMark: passMarkOf(req.body?.passMark),
        questions,
        assignedBy: req.user!.id,
        dueDate: parseDeadline(req.body?.dueDate),
      });
      await storage.replaceQuizAudience(assignedQuiz.id, audience.teacherIds);

      res.status(201).json({ ...assignedQuiz, teacherIds: audience.teacherIds });
      notifyQuizTeachers(
        req.params.batchId,
        audience.teacherIds,
        "A quiz is ready",
        `${title || selectedFile.fileName || "A slide quiz"} is ready for ${batch.name}. Open your exams to write it.`,
      ).catch((error) => console.error("Quiz ready notice failed:", error));
    } catch (error: any) {
      console.error("Error assigning file quiz:", error);
      const errorMessage = error?.message || "Failed to assign file quiz";
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/batches/:batchId/paper-exam", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const paperUrl = String(req.body?.paperUrl || "").trim();
      if (!paperUrl) return res.status(400).json({ error: "Upload the exam paper first" });
      const saved = await saveWritingExam(req.params.batchId, req.user!.id, {
        title: req.body?.title,
        description: req.body?.description,
        prompt: req.body?.prompt,
        paperUrl,
        paperName: req.body?.paperName,
        teacherIds: req.body?.teacherIds,
        dueDate: req.body?.dueDate,
      });
      if (saved.error) return res.status(saved.status || 400).json({ error: saved.error });
      res.status(201).json({ ...saved.quiz, teacherIds: saved.teacherIds });
      notifyQuizTeachers(
        req.params.batchId,
        saved.teacherIds || [],
        "A paper exam is ready",
        `${req.body?.title || "A paper exam"} is ready for ${batch.name}. Open it beside your answer document.`,
      ).catch((error) => console.error("Paper exam notice failed:", error));
    } catch (error) {
      console.error("Error assigning paper exam:", error);
      res.status(500).json({ error: "Failed to assign paper exam" });
    }
  });

  app.post("/api/batches/:batchId/open-exam", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const prompt = String(req.body?.prompt || "").trim();
      if (!prompt) return res.status(400).json({ error: "Write the exam prompt" });
      const saved = await saveWritingExam(req.params.batchId, req.user!.id, {
        title: req.body?.title,
        description: req.body?.description,
        prompt,
        teacherIds: req.body?.teacherIds,
        dueDate: req.body?.dueDate,
      });
      if (saved.error) return res.status(saved.status || 400).json({ error: saved.error });
      res.status(201).json({ ...saved.quiz, teacherIds: saved.teacherIds });
      notifyQuizTeachers(
        req.params.batchId,
        saved.teacherIds || [],
        "An exam is ready",
        `${req.body?.title || "An exam"} is ready for ${batch.name}. Open your exams and write your answers.`,
      ).catch((error) => console.error("Open exam notice failed:", error));
    } catch (error) {
      console.error("Error assigning open exam:", error);
      res.status(500).json({ error: "Failed to assign exam" });
    }
  });

  // Get assigned quizzes for a batch
  app.get("/api/batches/:batchId/quizzes", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quizzes = await storage.getAssignedQuizzesForBatch(req.params.batchId);
      const audience = await storage.getQuizAudienceMap(quizzes.map((quiz) => quiz.id));
      const names = await storage.getTeacherNameMap(Object.values(audience).flat());
      res.json(quizzes.map((quiz) => ({
        ...quiz,
        teacherIds: audience[quiz.id] || [],
        audience: audienceWithNames(audience[quiz.id] || [], names),
      })));
    } catch (error) {
      console.error("Error fetching assigned quizzes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get auto-generated file quizzes for a batch (from quiz_cache)
  app.get("/api/batches/:batchId/file-quizzes", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quizzes = await storage.getFileQuizzesForBatch(req.params.batchId);
      res.json(quizzes);
    } catch (error) {
      console.error("Error fetching file quizzes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get quiz details for trainer (to review before/after assignment)
  app.get("/api/trainer/quizzes/:quizId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      // Verify ownership through batch
      const batch = await storage.getBatch(quiz.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(quiz);
    } catch (error) {
      console.error("Error fetching quiz details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete an assigned quiz
  app.delete("/api/assigned-quizzes/:quizId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      // Verify ownership through batch
      const batch = await storage.getBatch(quiz.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteAssignedQuiz(req.params.quizId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting quiz:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reset a teacher's quiz attempts (allow retake after exhausting 3 attempts)
  app.post("/api/assigned-quizzes/:quizId/reset-teacher/:teacherId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const batch = await storage.getBatch(quiz.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.resetTeacherQuizAttempts(req.params.quizId, req.params.teacherId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting teacher quiz attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Edit quiz questions and/or deadline (trainer/admin)
  app.patch("/api/assigned-quizzes/:quizId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { questions } = req.body;
      const hasQuestions = Array.isArray(questions);
      const hasDueDate = Object.prototype.hasOwnProperty.call(req.body || {}, "dueDate");
      if (!hasQuestions && !hasDueDate) {
        return res.status(400).json({ error: "questions must be an array" });
      }
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const batch = await storage.getBatch(quiz.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (hasQuestions) {
        await storage.updateAssignedQuizQuestions(req.params.quizId, questions);
      }
      if (hasDueDate) {
        await storage.updateAssignedQuiz(req.params.quizId, { dueDate: parseDeadline(req.body.dueDate) });
      }
      const updated = await storage.getAssignedQuiz(req.params.quizId);
      res.json(updated);
      if (hasDueDate) {
        const due = parseDeadline(req.body.dueDate);
        const audience = await storage.getQuizAudienceMap([quiz.id]);
        notifyQuizTeachers(
          quiz.batchId,
          audience[quiz.id] || [],
          "Deadline updated",
          due
            ? `${quiz.title} is now due ${due.toLocaleString()}.`
            : `${quiz.title} no longer has a deadline.`,
        ).catch((error) => console.error("Deadline notice failed:", error));
      }
    } catch (error) {
      console.error("Error updating quiz questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get pending open-ended reviews for trainer
  app.get("/api/trainer/pending-reviews", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const trainerId = req.user?.role === "trainer" ? req.user.id : undefined;
      const reviews = await storage.getPendingReviewsForTrainer(trainerId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching pending reviews:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Submit open-ended reviews for a quiz attempt (trainer/admin)
  app.post("/api/quiz-attempts/:attemptId/review-open-ended", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { reviews } = req.body; // [{ questionId, passed, teacherAnswer }]
      if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ error: "reviews must be a non-empty array" });
      }

      // Fetch the attempt to validate it exists and get quiz/teacher info
      const allAttempts = await storage.getAllTeacherQuizAttempts("__placeholder__"); // we need by attemptId
      // Directly query by attemptId — use getTeacherQuizAttemptById if available, else use approach below
      // For now, patch each review and update status
      for (const review of reviews) {
        await storage.createOpenEndedReview({
          attemptId: req.params.attemptId,
          assignedQuizId: review.assignedQuizId || "",
          teacherId: review.teacherId || "",
          questionId: review.questionId,
          questionText: review.questionText || "",
          teacherAnswer: review.teacherAnswer || "",
          reviewedBy: req.user!.id,
          passed: review.passed,
          reviewedAt: new Date(),
        });
      }

      // Check if all open-ended are now reviewed
      const allReviews = await storage.getOpenEndedReviews(req.params.attemptId);
      const stillPending = allReviews.some(r => r.passed === null);
      const allPassed = allReviews.every(r => r.passed === true);
      await storage.updateAttemptReviewStatus(req.params.attemptId, stillPending, stillPending ? null : allPassed);

      res.json({ success: true, pending: stillPending });
    } catch (error) {
      console.error("Error submitting open-ended reviews:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================================
  // TEACHER QUIZ ROUTES (Teacher only)
  // ============================================================================

  // Get all quizzes assigned to teacher
  app.get("/api/teacher/quizzes", isTeacherAuthenticated, async (req, res) => {
    try {
      const quizzes = await storage.getAssignedQuizzesForTeacher(req.teacherId!);
      const tried = new Set((await storage.getAllTeacherQuizAttempts(req.teacherId!)).map((attempt) => attempt.assignedQuizId));
      const now = new Date();
      res.json(quizzes.filter((quiz) => fellowStillSees(quiz.dueDate, tried.has(quiz.id), now)).map((quiz) => ({
        ...learnerQuiz(quiz),
        kind: quiz.paperUrl ? "paper" : isWritingExam(quiz) ? "written" : "quiz",
      })));
    } catch (error) {
      console.error("Error fetching teacher quizzes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get a specific assigned quiz
  app.get("/api/assigned-quizzes/:quizId", isTeacherAuthenticated, async (req, res) => {
    try {
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      if (await blockAssignedQuiz(res, quiz)) return;
      const visible = await storage.getAssignedQuizzesForTeacher(req.teacherId!);
      if (!visible.some((item) => item.id === quiz.id)) {
        return res.status(403).json({ error: "This exam is not assigned to you" });
      }
      if (isPastDue(quiz.dueDate)) {
        const tries = await storage.getTeacherQuizAttemptsByQuiz(req.teacherId!, quiz.id);
        if (tries.length === 0) return res.status(410).json({ error: DEADLINE_PASSED });
      }
      const writing = isWritingExam(quiz);
      const questions = writing || quiz.shuffleQuestions === "no" ? quiz.questions : shuffleQuestions(quiz.questions);
      res.json({ ...quiz, questions: learnerQuestions(questions), passMark: passMarkOf(quiz.passMark) });
    } catch (error) {
      console.error("Error fetching quiz:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Submit quiz attempt (teacher)
  app.post("/api/assigned-quizzes/:quizId/submit", isTeacherAuthenticated, async (req, res) => {
    try {
      const { answers } = req.body;
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }
      if (await blockAssignedQuiz(res, quiz)) return;
      const visible = await storage.getAssignedQuizzesForTeacher(req.teacherId!);
      if (!visible.some((item) => item.id === quiz.id)) {
        return res.status(403).json({ error: "This exam is not assigned to you" });
      }
      if (isPastDue(quiz.dueDate)) return res.status(410).json({ error: DEADLINE_PASSED });

      // Get all existing attempts for this quiz
      const existingAttempts = await storage.getTeacherQuizAttemptsByQuiz(
        req.teacherId!,
        req.params.quizId
      );

      const passMark = passMarkOf((quiz as { passMark?: number }).passMark);
      const standing = assignedQuizStanding(existingAttempts, passMark);

      if (standing.hasPassed) {
        return res.status(400).json({ error: "Quiz already passed. Retakes are not allowed after passing." });
      }

      // Check if teacher has exhausted every attempt
      if (!standing.canRetake) {
        return res.status(400).json({ error: `Maximum of ${QUIZ_ATTEMPTS} attempts reached for this quiz.` });
      }

      // Calculate score — only MCQ/true_false questions count for auto-scoring
      let score = 0;
      const openEndedQuestions: any[] = [];
      quiz.questions.forEach((q: any) => {
        if (q.type === 'open_ended') {
          openEndedQuestions.push(q);
        } else if (answers[q.id] === q.correctAnswer) {
          score++;
        }
      });

      const mcqTotal = quiz.questions.filter((q: any) => q.type !== 'open_ended').length;
      const totalQuestions = quiz.questions.length;
      const percentage = mcqTotal > 0 ? Math.round((score / mcqTotal) * 100) : 100;
      const hasOpenEnded = openEndedQuestions.length > 0;
      // If no open-ended, pass/fail determined immediately; if open-ended, MCQ must pass first
      const passed = (!hasOpenEnded && percentage >= passMark) ? "yes" : (hasOpenEnded && percentage >= passMark) ? "pending" : "no";
      const attemptNumber = existingAttempts.length + 1;

      // Save attempt
      const attempt = await storage.saveTeacherQuizAttempt({
        teacherId: req.teacherId!,
        assignedQuizId: req.params.quizId,
        attemptNumber,
        answers,
        score,
        totalQuestions,
        passed: passed === "pending" ? "no" : passed, // stored as no until open-ended reviewed
      } as any);

      // If there are open-ended answers, save them as pending reviews
      if (hasOpenEnded && percentage >= passMark) {
        for (const q of openEndedQuestions) {
          await storage.createOpenEndedReview({
            attemptId: attempt.id,
            assignedQuizId: req.params.quizId,
            teacherId: req.teacherId!,
            questionId: q.id,
            questionText: q.question,
            teacherAnswer: answers[q.id] || "",
            reviewedBy: null,
            passed: null,
            reviewedAt: null,
          } as any);
        }
        await storage.updateAttemptReviewStatus(attempt.id, true, null);
      }

      // Update report card - count unique quizzes, not total attempts
      const allAttempts = await storage.getAllTeacherQuizAttempts(req.teacherId!);
      
      // Get unique quizzes attempted
      const uniqueQuizIds = new Set(allAttempts.map(a => a.assignedQuizId));
      const totalTaken = uniqueQuizIds.size;
      
      // Get unique quizzes passed (at least one passing attempt)
      const passedQuizIds = new Set();
      allAttempts.forEach(a => {
        if (a.passed === "yes") {
          passedQuizIds.add(a.assignedQuizId);
        }
      });
      const totalPassed = passedQuizIds.size;
      
      // Calculate average score based on best attempt per quiz
      const bestAttemptsByQuiz = new Map();
      allAttempts.forEach(a => {
        const quizId = a.assignedQuizId;
        const attemptPercentage = (a.score / a.totalQuestions) * 100;
        if (!bestAttemptsByQuiz.has(quizId) || attemptPercentage > bestAttemptsByQuiz.get(quizId)) {
          bestAttemptsByQuiz.set(quizId, attemptPercentage);
        }
      });
      
      const avgScore = totalTaken > 0 
        ? Math.round(Array.from(bestAttemptsByQuiz.values()).reduce((sum, score) => sum + score, 0) / totalTaken)
        : 0;

      let level = "Beginner";
      if (avgScore >= 85) level = "Advanced";
      else if (avgScore >= 70) level = "Intermediate";

      await storage.upsertTeacherReportCard({
        teacherId: req.teacherId!,
        level,
        totalQuizzesTaken: totalTaken,
        totalQuizzesPassed: totalPassed,
        averageScore: avgScore,
      });

      if (passed === "no") {
        const failCount = existingAttempts.filter((a) => a.passed === "no").length + 1;
        if (failCount >= 2) {
          notifyTeacher(
            req.teacherId!,
            "Quiz needs another try",
            `You have missed this quiz ${failCount} times. Open the module again before the last attempt.`,
            "general",
            { quizId: req.params.quizId },
          ).catch((error) => console.error("Fail-streak notice failed:", error));
        }
      }

      res.json({
        score,
        totalQuestions,
        mcqTotal,
        passed: passed === "yes",
        openEndedPending: hasOpenEnded && percentage >= passMark,
        percentage,
        attemptNumber,
        remainingAttempts: Math.max(0, QUIZ_ATTEMPTS - attemptNumber),
        review: answerReview(quiz.questions, answers, passed === "yes"),
      });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      res.status(500).json({ error: "Failed to submit quiz" });
    }
  });

  // Get all teachers' attempts for a quiz (trainer view — shows who passed/failed/exhausted)
  app.get("/api/assigned-quizzes/:quizId/all-teacher-attempts", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const batch = await storage.getBatch(quiz.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const batchTeachersData = await storage.getTeachersInBatch(quiz.batchId);
      const allAttempts = await Promise.all(
        batchTeachersData.map(async (t: any) => {
          const attempts = await storage.getTeacherQuizAttemptsByQuiz(t.id, req.params.quizId);
          const passed = attempts.some((a: any) => a.passed === "yes");
          const exhausted = attempts.length >= QUIZ_ATTEMPTS && !passed;
          return {
            teacherId: t.id,
            teacherName: t.name,
            teacherEmail: t.email,
            attempts: attempts.length,
            passed,
            exhausted,
            latestScore: attempts.length > 0 ? Math.round((attempts[attempts.length - 1].score / attempts[attempts.length - 1].totalQuestions) * 100) : null,
          };
        })
      );
      res.json(allAttempts);
    } catch (error) {
      console.error("Error fetching quiz teacher attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all teacher's quiz attempts for a specific quiz
  app.get("/api/assigned-quizzes/:quizId/attempts", isTeacherAuthenticated, async (req, res) => {
    try {
      const attempts = await storage.getTeacherQuizAttemptsByQuiz(
        req.teacherId!,
        req.params.quizId
      );
      
      // Get quiz details for enrichment
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      
      // Calculate quiz status at the quiz's own pass mark; answers show only once no retake is left.
      const standing = assignedQuizStanding(attempts, passMarkOf(quiz?.passMark));

      res.json({
        attempts,
        quiz: quiz ? attemptQuizView(quiz, standing) : quiz,
        hasPassed: standing.hasPassed,
        attemptsUsed: standing.attemptsUsed,
        remainingAttempts: standing.remainingAttempts,
        canRetake: standing.canRetake,
        shouldShowAnswers: standing.showAnswers,
      });
    } catch (error) {
      console.error("Error fetching attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher report card
  app.get("/api/teacher/report-card", isTeacherAuthenticated, async (req, res) => {
    try {
      const reportCard = await storage.getTeacherReportCard(req.teacherId!);
      res.json(reportCard || {
        level: "Beginner",
        totalQuizzesTaken: 0,
        totalQuizzesPassed: 0,
        averageScore: 0,
      });
    } catch (error) {
      console.error("Error fetching report card:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher's own quiz attempts history
  app.get("/api/teacher/quiz-attempts", isTeacherAuthenticated, async (req, res) => {
    try {
      const attempts = await storage.getAllTeacherQuizAttempts(req.teacherId!);

      // Enrich with quiz details; answers show only once no retake is left on that quiz.
      const enrichedAttempts = await Promise.all(
        attempts.map(async (attempt) => {
          const quiz = await storage.getAssignedQuiz(attempt.assignedQuizId);
          const standing = assignedQuizStanding(
            attempts.filter((other) => other.assignedQuizId === attempt.assignedQuizId),
            passMarkOf(quiz?.passMark),
          );
          return {
            ...attempt,
            quiz: quiz ? attemptQuizView(quiz, standing) : null,
          };
        })
      );
      
      res.json(enrichedAttempts);
    } catch (error) {
      console.error("Error fetching teacher quiz attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get progress for all teachers in a batch (trainer view). Course figures follow each Fellow's path in
  // this cohort (`cohortPath`), the rule the locks use; quiz medals count this cohort's quizzes only.
  app.get("/api/batches/:batchId/progress", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      const attendanceRows = await storage.getBatchAttendanceSummary(req.params.batchId);
      const attendanceByTeacher = Object.fromEntries(
        (attendanceRows || []).map((row: any) => [row.teacher_id || row.teacherId, row]),
      );
      const starRows = await db.select().from(trainerStars).where(eq(trainerStars.batchId, req.params.batchId));
      const starredTeacherIds = new Set(starRows.map((row) => row.teacherId));
      const readers = memoizedPathReaders();
      const progress = await Promise.all(
        teachers.map(async (teacher) => {
          const reportCard = await storage.refreshTeacherReportCard(teacher.id);
          const path = await cohortPath(teacher.id, batch, readers);
          const figures = cohortCourseFigures(path);
          const signals = await cohortQuizSignalsFor(teacher.id, batch.id, path.modules);
          const attendanceRow = attendanceByTeacher[teacher.id];
          const medals = cohortMedals({
            progressPercentage: figures.overallPercentage,
            coursesCompleted: figures.completedCount,
            attendanceRate: Number(attendanceRow?.attendance_rate || 0),
            attendanceDays: Number(attendanceRow?.total_days || 0),
            questionsAnswered: signals.questionsAnswered,
            quizzesPassed: signals.quizzesPassed,
            trainerStar: starredTeacherIds.has(teacher.id),
          });
          return {
            teacher: {
              id: teacher.id,
              teacherId: teacher.teacherId,
              name: teacher.name,
              email: teacher.email,
            },
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherEmail: teacher.email,
            reportCard: reportCard || {
              level: "Beginner",
              totalQuizzesTaken: 0,
              totalQuizzesPassed: 0,
              averageScore: 0,
            },
            courseCompletions: figures.courses,
            completedCount: figures.completedCount,
            inProgressCount: figures.inProgressCount,
            notStartedCount: figures.notStartedCount,
            overallPercentage: figures.overallPercentage,
            trainerStar: starredTeacherIds.has(teacher.id),
            medals,
          };
        })
      );
      res.json(progress);
    } catch (error) {
      console.error("Error fetching batch progress:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/batches/:batchId/gradebook.csv", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      const attendance = await storage.getBatchAttendanceSummary(req.params.batchId);
      const attendanceById = Object.fromEntries(
        (attendance || []).map((row: any) => [row.teacher_id || row.teacherId, row.attendance_rate ?? row.attendanceRate ?? 0]),
      );
      const header = [
        "name",
        "email",
        "teacher_id",
        "course_percent",
        "quiz_average",
        "quizzes_taken",
        "quizzes_passed",
        "attendance_percent",
        "courses_completed",
        "courses_assigned",
      ];
      const lines = [header.join(",")];
      // The same course figures as the progress route above.
      const readers = memoizedPathReaders();
      for (const teacher of teachers) {
        const reportCard = await storage.refreshTeacherReportCard(teacher.id);
        const figures = cohortCourseFigures(await cohortPath(teacher.id, batch, readers));
        const csvEscape = (value: string | number | null | undefined) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`;
        lines.push([
          csvEscape(teacher.name),
          csvEscape(teacher.email),
          csvEscape(teacher.teacherId),
          figures.overallPercentage,
          reportCard?.averageScore ?? 0,
          reportCard?.totalQuizzesTaken ?? 0,
          reportCard?.totalQuizzesPassed ?? 0,
          attendanceById[teacher.id] ?? 0,
          figures.completedCount,
          figures.courses.length,
        ].join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="gradebook-${req.params.batchId}.csv"`);
      res.send(lines.join("\n"));
    } catch (error) {
      console.error("Error exporting gradebook:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher quiz attempts for trainer to review
  app.get("/api/batches/:batchId/teachers/:teacherId/quiz-attempts", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const assignedAttempts = await storage.getAllTeacherQuizAttempts(req.params.teacherId);
      const fileAttempts = await db
        .select()
        .from(quizAttempts)
        .where(or(eq(quizAttempts.teacherId, req.params.teacherId), eq(quizAttempts.userId, req.params.teacherId)));

      const enrichedAssigned = await Promise.all(
        assignedAttempts.map(async (attempt) => {
          const quiz = await storage.getAssignedQuiz(attempt.assignedQuizId);
          return {
            ...attempt,
            source: "assigned",
            quiz: quiz || null,
          };
        })
      );
      const batchAssigned = enrichedAssigned.filter(a => a.quiz && a.quiz.batchId === req.params.batchId);
      const fileQuizRows = fileAttempts.map(attempt => ({
        ...attempt,
        source: "file",
        quiz: { title: "File quiz", weekId: attempt.weekId, deckFileId: attempt.deckFileId },
      }));
      
      res.json([...batchAssigned, ...fileQuizRows]);
    } catch (error) {
      console.error("Error fetching teacher quiz attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Teacher content viewing endpoints (with quiz gating)
  
  // The trainers of a Fellow's cohorts: `batches.trainer_id` and the `cohort_trainers` rows (C4, D8).
  // `created_by` grants nothing.
  app.get("/api/teacher/desk-peers", isTeacherAuthenticated, async (req, res) => {
    try {
      const batchesForTeacher = await storage.getBatchesForTeacher(req.teacherId!);
      const peers: Array<{ id: string; name: string; role: string }> = [];
      for (const enrolled of batchesForTeacher) {
        const batch: { trainerId?: string | null; trainerIds?: string[] } | undefined = await storage.getBatch(enrolled.id);
        for (const trainerId of [batch?.trainerId, ...(batch?.trainerIds || [])]) {
          if (!trainerId || peers.some((peer) => peer.id === trainerId)) continue;
          const trainer = await storage.getUser(trainerId);
          if (trainer) {
            peers.push({
              id: trainer.id,
              name: trainer.username,
              role: trainer.role,
            });
          }
        }
      }
      res.json(peers);
    } catch (error) {
      console.error("Error listing desk peers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // A Fellow's modules, cohort by cohort, in step order (D1), with the locks and figures of `cohortPath`.
  app.get("/api/teacher/assigned-weeks", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      // Open cohorts first, so a module in an open and a closed cohort shows under the open one.
      const cohorts = [...await storage.getBatchesForTeacher(teacherId)]
        .sort((a, b) => Number(!cohortIsOpen(a)) - Number(!cohortIsOpen(b)));
      const readers = memoizedPathReaders();
      const seenWeekIds = new Set<string>();
      const annotated: any[] = [];
      for (const cohort of cohorts) {
        const path = await cohortPath(teacherId, cohort, readers);
        // The same rule as POST /api/teacher/courses/:courseId/complete: C3 on the next course to check.
        const next = await nextCourseCompletion(teacherId, path.nextToCheck, readers);
        for (const { files, ...week } of path.modules) {
          if (seenWeekIds.has(week.id)) continue;
          seenWeekIds.add(week.id);
          annotated.push({
            ...week,
            canCheckComplete: week.courseId === path.nextToCheck && !week.locked && next?.complete === true,
          });
        }
      }
      res.json(annotated);
    } catch (error) {
      console.error("Error fetching assigned weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teacher/courses/:courseId/complete", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const batchId = String(req.body?.batchId || "");
      const courseId = req.params.courseId;
      if (!batchId) return res.status(400).json({ error: "Choose the cohort for this course" });
      const enrolled = await storage.getTeachersInBatch(batchId);
      const batch = await storage.getBatch(batchId);
      if (!batch || !cohortIsOpen(batch) || !enrolled.some((teacher) => teacher.id === teacherId)) {
        return res.status(403).json(refusal("NOT_ENROLLED"));
      }
      const placed = (await storage.getCoursesForBatch(batchId)).some((course) => course.id === courseId);
      // Order and locks from the cohort's steps (D1); completion from progress rows (C3), never a skip.
      const path = await cohortPath(teacherId, batch);
      const completion = await computeCourseCompletion(teacherId, courseId);
      const refused = courseCheckRefusal({ courseId, placed, path, completion });
      if (refused) return res.status(refused.status).json(refused.body);
      const saved = await storage.upsertTeacherCourseCompletion({
        teacherId,
        courseId,
        batchId,
        status: "completed",
        completedAt: new Date(),
        totalWeeks: completion.totalModules,
        completedWeeks: completion.doneModules,
      });
      res.json(saved);
    } catch (error) {
      console.error("Error checking a course complete:", error);
      res.status(500).json({ error: "Could not mark the course complete" });
    }
  });

  // Medals per cohort: course figures from the path, quiz signals from this cohort's quizzes (finding 22).
  app.get("/api/teacher/medals", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const enrolled = await storage.getBatchesForTeacher(teacherId);
      const readers = memoizedPathReaders();
      const rows = [];
      for (const batch of enrolled) {
        const path = await cohortPath(teacherId, batch, readers);
        const figures = cohortCourseFigures(path);
        const signals = await cohortQuizSignalsFor(teacherId, batch.id, path.modules);
        const attendance = await storage.getBatchAttendanceSummary(batch.id);
        const mine = (attendance || []).find((row: any) => (row.teacher_id || row.teacherId) === teacherId);
        const [star] = await db
          .select()
          .from(trainerStars)
          .where(and(eq(trainerStars.teacherId, teacherId), eq(trainerStars.batchId, batch.id)));
        rows.push({
          batchId: batch.id,
          batchName: batch.name,
          medals: cohortMedals({
            progressPercentage: figures.overallPercentage,
            coursesCompleted: figures.completedCount,
            attendanceRate: Number(mine?.attendance_rate || 0),
            attendanceDays: Number(mine?.total_days || 0),
            questionsAnswered: signals.questionsAnswered,
            quizzesPassed: signals.quizzesPassed,
            trainerStar: Boolean(star),
          }),
        });
      }
      res.json(rows);
    } catch (error) {
      console.error("Error loading teacher medals:", error);
      res.status(500).json({ error: "Could not load medals" });
    }
  });

  app.post("/api/batches/:batchId/teachers/:teacherId/star", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Cohort not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const enrolled = await storage.getTeachersInBatch(batch.id);
      const teacher = enrolled.find((row) => row.id === req.params.teacherId);
      if (!teacher) return res.status(404).json({ error: "That Fellow is not in this cohort" });
      const [existing] = await db
        .select()
        .from(trainerStars)
        .where(and(eq(trainerStars.teacherId, teacher.id), eq(trainerStars.batchId, batch.id)));
      if (existing) return res.json(existing);
      const [created] = await db.insert(trainerStars).values({
        teacherId: teacher.id,
        batchId: batch.id,
        awardedBy: req.user!.id,
        note: req.body?.note ? String(req.body.note).slice(0, 280) : null,
      }).returning();
      try {
        await storage.createNotification({
          recipientId: teacher.id,
          recipientType: "teacher",
          type: "general",
          title: "A trainer star",
          message: `${req.user!.username || "Your trainer"} gave you a star in ${batch.name}.`,
        });
      } catch {
        /* the star still stands if the notice cannot be saved */
      }
      res.status(201).json(created);
    } catch (error) {
      console.error("Error giving a trainer star:", error);
      res.status(500).json({ error: "Could not give the star" });
    }
  });

  app.delete("/api/batches/:batchId/teachers/:teacherId/star", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Cohort not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      await db.delete(trainerStars).where(and(
        eq(trainerStars.teacherId, req.params.teacherId),
        eq(trainerStars.batchId, batch.id),
      ));
      res.sendStatus(204);
    } catch (error) {
      console.error("Error removing a trainer star:", error);
      res.status(500).json({ error: "Could not remove the star" });
    }
  });

  app.get("/api/teacher/skills-map", isTeacherAuthenticated, async (req, res) => {
    try {
      const courseBatchPairs = await db
        .select({ course: courses, batchId: batchTeachers.batchId })
        .from(batchTeachers)
        .innerJoin(batchCourses, eq(batchTeachers.batchId, batchCourses.batchId))
        .innerJoin(courses, eq(batchCourses.courseId, courses.id))
        .where(eq(batchTeachers.teacherId, req.teacherId!));
      const readers = memoizedPathReaders();
      const skills = new Map<string, { competency: string; modules: number; completed: number }>();
      const seenWeekIds = new Set<string>();
      for (const { course } of courseBatchPairs) {
        if (course.publishStatus === "draft") continue;
        const courseWeeks = await storage.getWeeksForCourse(course.id);
        for (const week of courseWeeks) {
          if (seenWeekIds.has(week.id)) continue;
          seenWeekIds.add(week.id);
          const key = (week.competencyFocus || "General practice").trim();
          const row = skills.get(key) || { competency: key, modules: 0, completed: 0 };
          row.modules += 1;
          // A module is complete when every lesson file is done (C2, D6); one with no file is complete.
          if (moduleIsComplete(moduleProgress(await lessonFileStates(req.teacherId!, week, readers)))) row.completed += 1;
          skills.set(key, row);
        }
      }
      res.json(Array.from(skills.values()).map((row) => ({
        ...row,
        coverage: row.modules > 0 ? Math.round((row.completed / row.modules) * 100) : 0,
      })));
    } catch (error) {
      console.error("Error building skills map:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all content files for a week with progress and unlock status. N4: the Fellow is in an open cohort
  // that holds the published course, and the module is unlocked there (`teacherModuleAccess`).
  app.get("/api/teachers/weeks/:weekId/content", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId } = req.params;
      const teacherId = req.teacherId!;

      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles) {
        return res.status(404).json({ error: "Week not found" });
      }
      const access = await teacherModuleAccess(teacherId, week);
      if (!access.ok) return res.status(access.refusal.status).json(access.refusal.body);

      // Each file with its progress, whether it has an approved quiz, and whether it is done (C2, D6).
      const contentWithProgress = week.deckFiles.map((file) => {
        const state = access.module.files.find((entry) => entry.fileId === file.id);
        const progress = state?.row as any;
        const done = Boolean(state?.done);
        const status = state?.locked ? "locked" : done ? "completed" : (progress?.status || "available");
        return {
          ...file,
          status,
          quizApproved: Boolean(state?.hasApprovedQuiz),
          quizPassed: Boolean(state?.quizPassed),
          done,
          progress: done
            ? { ...(progress || {}), status: "completed", completedAt: progress?.completedAt || new Date() }
            : progress,
        };
      });

      res.json({
        week,
        content: contentWithProgress,
      });
    } catch (error) {
      console.error("Error fetching teacher content:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark content as read. With no approved quiz this completes the file (D6), then the course syncs.
  app.post("/api/teachers/weeks/:weekId/content/:deckFileId/viewed", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId, deckFileId } = req.params;
      const teacherId = req.teacherId!;
      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles?.some((file) => file.id === deckFileId)) {
        return res.status(404).json({ error: "Lesson file not found" });
      }
      // The content GET's gate: no marks in a module the Fellow cannot open, or on a locked file.
      const access = await teacherModuleAccess(teacherId, week);
      if (!access.ok) return res.status(access.refusal.status).json(access.refusal.body);
      const file = access.module.files.find((entry) => entry.fileId === deckFileId);
      if (!file || file.locked) {
        return res.status(403).json({ error: "Finish the lesson file before this one first.", locked: true });
      }

      const progress = await storage.upsertTeacherContentProgress({
        teacherId,
        weekId,
        deckFileId,
        ...markReadProgress(file.hasApprovedQuiz, new Date()),
      });
      if (week.courseId) {
        try {
          await storage.syncTeacherCourseCompletion(teacherId, week.courseId);
        } catch (syncError) {
          console.error("Error syncing course completion after a read:", syncError);
        }
      }

      res.json(progress);
    } catch (error) {
      console.error("Error marking content as viewed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get quiz pass/fail status for all files in a week (used by content page to show quiz buttons)
  app.get("/api/teacher/week/:weekId/file-quizzes", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId } = req.params;
      const teacherId = req.teacherId!;

      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles) return res.json({});

      const result: Record<string, { passed: boolean; hasPassed: boolean; attempts: number; quizExists: boolean }> = {};

      for (const file of week.deckFiles) {
        // Check quiz_cache — does an approved quiz exist for this file? A draft does not count for a teacher.
        const cached = await storage.getCachedQuiz(weekId, file.id);
        const quizExists = isLiveLessonQuiz(cached);
        const passed = await storage.hasPassedFileQuiz(weekId, file.id, teacherId);
        const contentAttempts = await storage.getAllTeacherContentQuizAttemptsForFile(teacherId, weekId, file.id);
        result[file.id] = { passed, hasPassed: passed, attempts: contentAttempts.length, quizExists };
      }

      res.json(result);
    } catch (error) {
      console.error("[FILE-QUIZ-STATUS] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer endpoint: Get teacher's content viewing history for a week. Admins, or a trainer running a
  // cohort that enrolls the Fellow and holds the module's course.
  app.get("/api/trainers/teachers/:teacherId/weeks/:weekId/content-history", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId, weekId } = req.params;

      // Get week details
      const week = await storage.getTrainingWeek(weekId);
      if (!week) return res.status(404).json({ error: "Module not found" });
      if (!await trainerMaySeeTeacherModule(req.user, teacherId, week.courseId)) {
        return res.status(403).json(refusal("NOT_YOUR_COURSE"));
      }

      // Get all progress records
      const progressRecords = await storage.getAllTeacherContentProgressForWeek(teacherId, weekId);

      // Get all quiz attempts
      const allAttempts = await storage.getAllTeacherContentQuizAttemptsForFile(teacherId, weekId, ""); // Get all files

      // Get all regenerations
      const regenerations = await storage.getAllTeacherQuizRegenerationsForWeek(teacherId, weekId);

      // Organize data by deck file
      const history = progressRecords.map(progress => {
        const file = week.deckFiles?.find(f => f.id === progress.deckFileId);
        const fileAttempts = allAttempts.filter(a => a.deckFileId === progress.deckFileId);
        const fileRegenerations = regenerations.filter(r => r.deckFileId === progress.deckFileId);

        return {
          file,
          progress,
          attempts: fileAttempts,
          regenerations: fileRegenerations,
        };
      });

      res.json(history);
    } catch (error) {
      console.error("Error fetching content history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer Dashboard Routes
  
  // Get dashboard statistics
  app.get("/api/admin/dashboard-stats", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const approvedTrainers = await db.select().from(users).where(and(eq(users.role, "trainer"), eq(users.approvalStatus, "approved")));
      const approvedTeachers = await db.select().from(teachers).where(eq(teachers.approvalStatus, "approved"));
      const pendingTrainers = await storage.getPendingTrainers();
      const pendingTeachers = await storage.getPendingTeachers();
      const allCourses = await storage.getAllCourses();
      const weekAhead = await db.execute(sql`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE meeting_url IS NOT NULL)::int AS online
        FROM scheduled_events
        WHERE event_type = 'session' AND start_date >= date_trunc('day', now()) AND start_date < date_trunc('day', now()) + interval '7 days'
      `);
      const unmarked = await db.execute(sql`SELECT COUNT(*)::int AS count FROM assignment_submissions WHERE trainer_score IS NULL`);
      const week = (weekAhead.rows?.[0] || {}) as { total?: number; online?: number };

      res.json({
        totalTrainers: approvedTrainers.length,
        totalTeachers: approvedTeachers.length,
        totalCourses: allCourses.length,
        activeUsers: approvedTrainers.length + approvedTeachers.length,
        pendingTrainers: pendingTrainers.length,
        pendingTeachers: pendingTeachers.length,
        fellowKinds: countKinds(approvedTeachers.map((row) => fellowTypeOf(row.fellowType)), FELLOW_TYPES),
        trainerKinds: countKinds(approvedTrainers.map((row) => trainerTypeOf(row.trainerType)), TRAINER_TYPES),
        sessionsNextSevenDays: Number(week.total || 0),
        onlineSessionsNextSevenDays: Number(week.online || 0),
        answersToMark: Number((unmarked.rows?.[0] as { count?: number } | undefined)?.count || 0),
      });
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/attendance-summary", isAuthenticated, isStrictAdmin, async (_req, res) => {
    try {
      res.json(await loadAttendanceLists());
    } catch (error) {
      console.error("Error loading attendance lists:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/announce", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const title = String(req.body?.title || "").trim();
      const message = String(req.body?.message || "").trim();
      if (!title || !message) {
        return res.status(400).json({ error: "title and message are required" });
      }
      const approvedTeachers = await storage.getApprovedTeachers();
      const approvedTrainers = await db.select().from(users).where(and(eq(users.role, "trainer"), eq(users.approvalStatus, "approved")));
      let sent = 0;
      for (const teacher of approvedTeachers) {
        await storage.createNotification({
          recipientId: teacher.id,
          recipientType: "teacher",
          type: "general",
          title: title.slice(0, 120),
          message,
          metadata: { academy: true },
        });
        sent += 1;
      }
      for (const trainer of approvedTrainers) {
        await storage.createNotification({
          recipientId: trainer.id,
          recipientType: "trainer",
          type: "general",
          title: title.slice(0, 120),
          message,
          metadata: { academy: true },
        });
        sent += 1;
      }
      res.json({ sent });
    } catch (error) {
      console.error("Error sending academy notice:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/fresh-start", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const scope = parseActivityScope(req.body);
      if ("error" in scope) {
        return res.status(400).json({ error: scope.error });
      }
      const summary = await clearSelectedActivity(pool, scope);
      await recordAudit({
        actorId: req.user?.id,
        actorRole: req.user?.role,
        action: "fresh_start",
        targetType: "academy",
        metadata: {
          removedRows: summary.removedRows,
          areas: summary.areas,
          people: summary.people,
        },
      });
      res.json({
        ok: true,
        removedRows: summary.removedRows,
        areas: summary.areas,
        people: summary.people,
        kept: summary.kept,
      });
    } catch (error) {
      console.error("Error clearing academy activity:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/approval-history", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const format = String(req.query.format || "");
      if (format === "csv") {
        const result = await pool.query(allApprovalHistorySelectSql(false));
        const csv = approvalHistoryToCsv(result.rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=\"approval-history.csv\"");
        return res.send(csv);
      }
      const paging = approvalHistoryPage(req.query.page);
      const [countResult, pageResult] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS total FROM approval_history"),
        pool.query(allApprovalHistorySelectSql(true), [paging.pageSize, paging.offset]),
      ]);
      const total = Number(countResult.rows[0]?.total || 0);
      res.json({
        items: pageResult.rows.map((row) => mapApprovalHistoryRow(row)),
        page: paging.page,
        pageSize: paging.pageSize,
        pages: paging.pages(total),
        total,
      });
    } catch (error) {
      console.error("Error reading approval history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/batches/:id/approval-history", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.id);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      const format = String(req.query.format || "");
      if (format === "csv") {
        const result = await pool.query(batchApprovalHistorySelectSql(false), [req.params.id]);
        const csv = approvalHistoryToCsv(result.rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="batch-${req.params.id}-approval-history.csv"`);
        return res.send(csv);
      }
      const paging = approvalHistoryPage(req.query.page);
      const [countResult, pageResult] = await Promise.all([
        pool.query(batchApprovalHistoryCountSql(), [req.params.id]),
        pool.query(batchApprovalHistorySelectSql(true), [req.params.id, paging.pageSize, paging.offset]),
      ]);
      const total = Number(countResult.rows[0]?.total || 0);
      res.json({
        items: pageResult.rows.map((row) => mapApprovalHistoryRow(row)),
        page: paging.page,
        pageSize: paging.pageSize,
        pages: paging.pages(total),
        total,
      });
    } catch (error) {
      console.error("Error reading batch approval history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all trainers with progress
  app.get("/api/admin/trainers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const allTrainers = await db.select().from(users).where(eq(users.role, "trainer")).orderBy(users.createdAt);
      // D8: the cohorts a trainer runs, by C4, the rule the desk and the route guard use.
      const cohortCounts = await trainerCohortCounts(allTrainers.map((trainer) => trainer.id));
      const trainersData = allTrainers.map((trainer: any) => ({
        id: trainer.id,
        username: trainer.username,
        email: trainer.email,
        role: trainer.role,
        approvalStatus: trainer.approvalStatus,
        createdAt: trainer.createdAt,
        lastLogin: trainer.lastLogin,
        cohortCount: cohortCounts[trainer.id] || 0,
      }));
      
      res.json(trainersData);
    } catch (error) {
      console.error("Error getting trainers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get trainer detail
  app.get("/api/admin/trainers/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const trainer = await storage.getUser(id);
      
      if (!trainer) {
        return res.status(404).json({ error: "Trainer not found" });
      }

      const { password, resetToken: _resetToken, ...sanitized } = trainer;
      const trainerBatches = await storage.getAllBatches(id);
      res.json({
        ...sanitized,
        cohortCount: trainerBatches.length,
        progress: trainerBatches.length > 0 ? 100 : 0,
        filesCompleted: trainerBatches.length,
        completedLessons: trainerBatches.map((batch: any) => batch.name),
        activityTimeline: [],
      });
    } catch (error) {
      console.error("Error getting trainer details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all teachers with progress
  app.get("/api/admin/teachers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const summaries = await loadTeacherLearningSummaries();
      const allTeachers = await db.select().from(teachers);
      res.json(allTeachers.map((teacher) => {
        const summary = summaries.get(teacher.id) || emptyTeacherSummary();
        return {
          id: teacher.id,
          teacherId: teacher.teacherId,
          name: teacher.name,
          email: teacher.email,
          role: "teacher",
          approvalStatus: teacher.approvalStatus,
          createdAt: teacher.createdAt,
          lastLogin: summary.lastActive,
          progress: summary.progress,
          filesViewed: summary.filesViewed,
          courseCompletion: summary.courseCompletion,
        };
      }));
    } catch (error) {
      console.error("Error getting teachers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher detail
  app.get("/api/admin/teachers/:id", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const teacher = await storage.getTeacher(id);
      
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const { password, ...sanitized } = teacher;
      const summaries = await loadTeacherLearningSummaries();
      const summary = summaries.get(teacher.id) || emptyTeacherSummary();
      res.json({
        ...sanitized,
        progress: summary.progress,
        filesViewed: summary.filesViewed,
        courseCompletion: summary.courseCompletion,
        lastLogin: summary.lastActive,
      });
    } catch (error) {
      console.error("Error getting teacher details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== COURSE MANAGEMENT (ADMIN ONLY) ====================
  // Get all courses
  app.get("/api/courses", isAuthenticated, async (req, res) => {
    try {
      const courses = publishedOnly(await storage.getAllCourses(), req);
      res.json(courses);
    } catch (error) {
      console.error("Error getting courses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get course with weeks
  app.get("/api/courses/:id", isAuthenticated, async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.publishStatus === "draft" && !isAcademyStaff(req.user)) {
        return res.status(404).json({ error: "Course not found" });
      }
      const weeks = await storage.getWeeksForCourse(course.id);
      res.json({ ...course, weeks });
    } catch (error) {
      console.error("Error getting course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get weeks for a course
  app.get("/api/courses/:courseId/weeks", isAuthenticated, async (req, res) => {
    try {
      const weeks = await storage.getWeeksForCourse(req.params.courseId);
      res.json(weeks);
    } catch (error) {
      console.error("Error getting weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batches that have a course assigned
  app.get("/api/courses/:courseId/batches", isAuthenticated, async (req, res) => {
    try {
      const { courseId } = req.params;
      
      // Query batchCourses to find all batches with this course
      const batchesWithCourse = await db
        .select({ batch: batches })
        .from(batchCourses)
        .innerJoin(batches, eq(batchCourses.batchId, batches.id))
        .where(eq(batchCourses.courseId, courseId));
      
      // Admins see every cohort; a trainer sees the cohorts they run (C4).
      res.json(await cohortsInScope(req.user, batchesWithCourse.map((row) => row.batch)));
    } catch (error) {
      console.error("Error getting batches for course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create course (admin only)
  app.post("/api/courses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name, description, orderIndex, objectives, publishStatus, stage, track } = req.body;
      const course = await storage.createCourse({
        name,
        description,
        objectives,
        stage: stage || null,
        track: track === "secondary" ? "secondary" : track === "primary" ? "primary" : null,
        publishStatus: publishStatus === "draft" ? "draft" : "published",
        orderIndex: orderIndex || 0,
      });
      res.json(course);
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update course: an admin, or a trainer who may edit it (made it, or it is on a cohort they teach).
  app.patch("/api/courses/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!(await trainerMayEditCourse(req.user, req.params.id))) {
        return res.status(403).json(refusal("NOT_YOUR_COURSE"));
      }
      const { name, description, objectives, publishStatus, stage, track, orderIndex } = req.body || {};
      const course = await storage.updateCourse(req.params.id, Object.fromEntries(Object.entries({
        name, description, objectives, publishStatus, stage, track, orderIndex,
      }).filter(([, value]) => value !== undefined)));
      if (!course) return res.status(404).json({ error: "Course not found" });
      res.json(course);
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete course (admin only)
  app.delete("/api/courses/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const success = await storage.deleteCourse(req.params.id);
      if (!success) return res.status(404).json({ error: "Course not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reorder the modules of a course: an admin, or a trainer whose cohort holds the course (D2)
  app.post("/api/courses/:courseId/weeks/reorder", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, newPosition } = req.body;
      const { courseId } = req.params;
      if (!(await trainerMayEditCourse(req.user, courseId))) {
        return res.status(403).json(refusal("NOT_YOUR_COURSE"));
      }

      if (!weekId || typeof newPosition !== 'number') {
        return res.status(400).json({ error: "Invalid request: weekId and newPosition required" });
      }

      // Get all weeks for this course
      const weeks = await storage.getWeeksForCourse(courseId);
      
      // Find the week to move
      const weekIndex = weeks.findIndex(w => w.id === weekId);
      if (weekIndex === -1) {
        return res.status(404).json({ error: "Training week not found" });
      }

      // Validate new position
      if (newPosition < 1 || newPosition > weeks.length) {
        return res.status(400).json({ error: `Invalid position: must be between 1 and ${weeks.length}` });
      }

      // Remove the week from its current position
      const [weekToMove] = weeks.splice(weekIndex, 1);
      
      // Insert at new position (newPosition - 1 for 0-based indexing)
      weeks.splice(newPosition - 1, 0, weekToMove);

      // Renumber all weeks sequentially
      const updatePromises = weeks.map((week, index) => 
        storage.updateTrainingWeek({
          id: week.id,
          weekNumber: index + 1
        })
      );

      await Promise.all(updatePromises);

      // Return updated weeks
      const updatedWeeks = await storage.getWeeksForCourse(courseId);
      res.json(updatedWeeks);
    } catch (error) {
      console.error("Error reordering weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== BATCH-COURSE ASSIGNMENTS (TRAINER) ====================
  // Assign courses to batch (trainer)
  app.post("/api/batches/:batchId/courses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { courseId } = req.body;
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      
      const assignment = await storage.assignCourseToBatch({
        batchId: req.params.batchId,
        courseId,
        assignedBy: req.user!.id,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning course:", error);
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      if (errorMessage.includes("already assigned")) {
        res.status(409).json({ error: errorMessage });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Get courses for batch
  app.get("/api/batches/:batchId/courses", isAuthenticatedAny, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      const sessionTeacherId = (req.session as any)?.teacherId as string | undefined;
      let allowed = staffCanAccessBatch(req.user, batch);
      if (!allowed && sessionTeacherId) {
        const enrolled = await storage.getTeachersInBatch(batch.id);
        allowed = enrolled.some((teacher) => teacher.id === sessionTeacherId);
      }
      if (!allowed) return res.status(403).json({ error: "Access denied" });
      const courses = await storage.getCoursesForBatch(req.params.batchId);
      res.json(courses);
    } catch (error) {
      console.error("Error getting courses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Remove course from batch (trainer)
  app.delete("/api/batches/:batchId/courses/:courseId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const success = await storage.removeCoursesFromBatch(req.params.batchId, req.params.courseId);
      if (!success) return res.status(404).json({ error: "Assignment not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get courses for teacher (assigned to their batches)
  app.get("/api/teacher/:teacherId/courses", isAuthenticatedAny, async (req, res) => {
    try {
      if (!(await teacherRecordAllowed(req, req.params.teacherId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const courses = await storage.getCoursesForTeacher(req.params.teacherId);
      res.json(courses);
    } catch (error) {
      console.error("Error getting teacher courses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== CERTIFICATE MANAGEMENT ====================
  // A trainer reaches a cohort's certificate rows only when they run the cohort (C4, N6); an admin reaches every cohort.
  // Sends the 404 or 403 itself and returns false when the caller may not.
  async function certificateCohortAllowed(req: Request, res: Response, batchId: string) {
    const access = await certificateCohortAccess(req.user, batchId);
    if (access === "missing") res.status(404).json({ error: "Cohort not found" });
    if (access === "denied") res.status(403).json({ error: "Access denied" });
    return access === "allowed";
  }

  // Get certificate template for batch
  app.get("/api/batches/:batchId/certificate-template", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!(await certificateCohortAllowed(req, res, req.params.batchId))) return;
      const template = await storage.getBatchCertificateTemplate(req.params.batchId);
      res.json(template || null);
    } catch (error) {
      console.error("Error getting certificate template:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Upsert certificate template (admin or trainer)
  app.post("/api/batches/:batchId/certificate-template", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!(await certificateCohortAllowed(req, res, req.params.batchId))) return;
      const { courseId, appreciationText, adminName1, adminName2 } = req.body;
      const template = await storage.upsertBatchCertificateTemplate({
        batchId: req.params.batchId,
        courseId,
        appreciationText,
        adminName1,
        adminName2,
        status: "draft",
      });
      res.json(template);
    } catch (error) {
      console.error("Error saving certificate template:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve certificate template (admin only)
  app.post("/api/batches/:batchId/certificate-template/approve", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!(await certificateCohortAllowed(req, res, req.params.batchId))) return;
      const template = await storage.approveBatchCertificateTemplate(req.params.batchId, req.user!.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error) {
      console.error("Error approving certificate template:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/certificate-templates", isAuthenticated, isStrictAdmin, async (_req, res) => {
    const { CERTIFICATE_DESIGNS, CERTIFICATE_SIGNERS } = await import("@shared/certificateDesigns");
    res.json({ designs: CERTIFICATE_DESIGNS, signers: CERTIFICATE_SIGNERS });
  });

  app.get("/api/admin/certificates", isAuthenticated, isStrictAdmin, async (_req, res) => {
    try {
      const certs = await storage.listAllTeacherCertificates();
      res.json(certs);
    } catch (error) {
      console.error("Error listing academy certificates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Who may receive which certificate, by the rules the issue route applies (D4): the academy path for Fellowship and
  // Advanced, every module of a course for a course certificate. Recomputed from progress, never from stored flags.
  app.get("/api/admin/certificates/eligible", isAuthenticated, isStrictAdmin, async (_req, res) => {
    try {
      res.json(await listEligibleFellows(await loadEligibilityRows()));
    } catch (error) {
      console.error("Error listing certificate eligibility:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/certificates/issue", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { isCertificateDesignId } = await import("@shared/certificateDesigns");
      const teacherId = String(req.body?.teacherId || "").trim();
      const design = String(req.body?.design || "fellowship").trim();
      const occasion = String(req.body?.occasion || "graduation").trim() === "course" ? "course" : "graduation";
      const courseId = String(req.body?.courseId || "").trim() || undefined;
      const batchId = String(req.body?.batchId || "").trim() || undefined;
      if (!teacherId || !isCertificateDesignId(design)) {
        return res.status(400).json({ error: "teacherId and a valid design are required" });
      }
      if (occasion === "course" && !courseId) {
        return res.status(400).json({ error: "courseId is required for course completion certificates" });
      }
      if (!(await storage.getTeacher(teacherId))) return res.status(404).json({ error: "Teacher not found" });
      if (occasion === "course" && !(await storage.getCourse(courseId!))) return res.status(404).json({ error: "Course not found" });
      // D4: a course certificate needs every module of the course; Fellowship and Advanced need the academy path done.
      const refused = await certificateRefusal({ teacherId, occasion, courseId });
      if (refused) return res.status(400).json(refused);
      const cert = await storage.issueAcademyCertificate({
        teacherId,
        design,
        occasion,
        courseId,
        batchId,
      });
      res.status(201).json(cert);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      const status = message === "Teacher not found" || message === "Course not found" ? 404 : 500;
      console.error("Error issuing academy certificate:", error);
      res.status(status).json({ error: message === "Teacher not found" || message === "Course not found" ? message : "Internal server error" });
    }
  });

  // Get teacher certificate
  app.get("/api/teacher/:teacherId/certificates/:batchId/:courseId", isAuthenticatedAny, async (req, res) => {
    try {
      if (!(await teacherRecordAllowed(req, req.params.teacherId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const cert = await storage.getTeacherCertificate(req.params.teacherId, req.params.batchId, req.params.courseId);
      res.json(cert || null);
    } catch (error) {
      console.error("Error getting certificate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all certificates for teacher
  app.get("/api/teacher/:teacherId/certificates", isAuthenticatedAny, async (req, res) => {
    try {
      if (!(await teacherRecordAllowed(req, req.params.teacherId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const certs = await storage.getTeacherCertificates(req.params.teacherId);
      res.json(certs);
    } catch (error) {
      console.error("Error getting certificates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get certificates for batch (admin or trainer)
  app.get("/api/batches/:batchId/certificates", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!(await certificateCohortAllowed(req, res, req.params.batchId))) return;
      const certs = await storage.getCertificatesForBatch(req.params.batchId);
      res.json(certs);
    } catch (error) {
      console.error("Error getting batch certificates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get certificate by ID: an admin sees any; a trainer sees it when the Fellow is in a cohort they run (C4)
  app.get("/api/certificates/:certId", isAuthenticated, async (req, res) => {
    try {
      const cert = await storage.getTeacherCertificateById(req.params.certId);
      if (!cert) {
        return res.status(404).json({ error: "Certificate not found" });
      }
      if (!(await teacherRecordAllowed(req, cert.teacherId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(cert);
    } catch (error) {
      console.error("Error getting certificate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update certificate (admin/trainer only)
  app.patch("/api/certificates/:certId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { teacherName, courseName, appreciationText, adminName1, adminName2 } = req.body;
      
      const updates: any = {};
      if (teacherName !== undefined) updates.teacherName = teacherName;
      if (courseName !== undefined) updates.courseName = courseName;
      if (appreciationText !== undefined) updates.appreciationText = appreciationText;
      if (adminName1 !== undefined) updates.adminName1 = adminName1;
      if (adminName2 !== undefined) updates.adminName2 = adminName2;
      
      const updated = await storage.updateTeacherCertificate(req.params.certId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Certificate not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating certificate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== ANALYTICS ====================
  // Admin analytics (all batches/courses)
  app.get("/api/admin/analytics/batches", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const analytics = await storage.getBatchAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting batch analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch analytics
  app.get("/api/admin/analytics/batches/:batchId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const analytics = await storage.getBatchAnalytics(req.params.batchId);
      res.json(analytics);
    } catch (error) {
      console.error("Error getting batch analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Course analytics
  app.get("/api/admin/analytics/courses", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const analytics = await storage.getCourseAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting course analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get course analytics
  app.get("/api/admin/analytics/courses/:courseId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const analytics = await storage.getCourseAnalytics(req.params.courseId);
      res.json(analytics);
    } catch (error) {
      console.error("Error getting course analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer analytics (their batches/teachers)
  app.get("/api/trainer/desk", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const trainerId = req.user?.role === "trainer" ? req.user.id : undefined;
      const desk = await storage.getTrainerDesk(trainerId);
      let encouragement = "";
      try {
        if (req.user?.id) encouragement = await encouragementFor(req.user.id);
      } catch (error) {
        console.error("Encouragement unavailable:", error);
      }
      res.json({ ...desk, encouragement });
    } catch (error) {
      console.error("Error getting trainer desk:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/trainer/analytics", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const trainerId = req.user?.role === "trainer" ? req.user.id : undefined;
      const analytics = await storage.getTrainerAnalytics(trainerId);
      res.json(analytics);
    } catch (error) {
      console.error("Error getting trainer analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer teacher analytics
  app.get("/api/trainer/analytics/teachers", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const trainerId = req.user?.role === "trainer" ? req.user.id : undefined;
      const analytics = await storage.getTeacherAnalyticsForTrainer(trainerId);
      res.json(analytics);
    } catch (error) {
      console.error("Error getting teacher analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========== Enhanced Analytics Endpoints ==========

  app.get("/api/admin/analytics/pipeline", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getPipelineOverview();
      res.json(data);
    } catch (error) {
      console.error("Error getting pipeline overview:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/demographics", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getDemographicsAnalytics();
      res.json(data);
    } catch (error) {
      console.error("Error getting demographics analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/cohorts", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getCohortAnalytics();
      res.json(data);
    } catch (error) {
      console.error("Error getting cohort analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/performance", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getPerformanceAnalytics();
      res.json(data);
    } catch (error) {
      console.error("Error getting performance analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/snapshot", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      res.json(await storage.getAcademySnapshot());
    } catch (error) {
      console.error("Error getting academy snapshot:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/completion-trends", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getCompletionTrends();
      res.json(data);
    } catch (error) {
      console.error("Error getting completion trends:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all users for admin people overview
  app.get("/api/admin/users/all", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      // Get all trainers (users with trainer role)
      const trainers = await db.select().from(users).where(eq(users.role, "trainer"));
      
      // Get all teachers
      const allTeachers = await db.select().from(teachers);
      
      // Enrich trainers with batch count
      const enrichedTrainers = await Promise.all(
        trainers.map(async (trainer) => {
          const owned = await storage.getAllBatches(trainer.id);
          const courseIds = new Set<string>();
          for (const batch of owned) {
            const linked = await storage.getCoursesForBatch(batch.id);
            linked.forEach((course) => courseIds.add(course.id));
          }
          return {
            id: trainer.id,
            email: trainer.email,
            username: trainer.username,
            name: `${trainer.firstName || ""} ${trainer.lastName || ""}`.trim() || trainer.username,
            role: trainer.role,
            approvalStatus: trainer.approvalStatus,
            batchCount: owned.length,
            courseCount: courseIds.size,
          };
        })
      );

      const completionRows = await db.select({
        teacherId: teacherCourseCompletion.teacherId,
        completedWeeks: teacherCourseCompletion.completedWeeks,
        totalWeeks: teacherCourseCompletion.totalWeeks,
      }).from(teacherCourseCompletion);
      const riskByTeacher = new Map<string, boolean>();
      for (const row of completionRows) {
        if (!row.totalWeeks || row.totalWeeks <= 0) continue;
        if ((row.completedWeeks / row.totalWeeks) * 100 < 30) riskByTeacher.set(row.teacherId, true);
      }

      // Enrich teachers with course count
      const enrichedTeachers = await Promise.all(
        allTeachers.map(async (teacher) => {
          const enrolled = await storage.getBatchesForTeacher(teacher.id);
          const courseCount = enrolled.length;
          return {
            id: teacher.id,
            email: teacher.email,
            name: teacher.name,
            teacherNumber: teacher.teacherId,
            role: "teacher",
            approvalStatus: teacher.approvalStatus,
            courseCount,
            risk: riskByTeacher.get(teacher.id) ? "at-risk" : "on-track",
          };
        })
      );

      res.json([...enrichedTrainers, ...enrichedTeachers]);
    } catch (error) {
      console.error("Error getting all users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Create a new user (admin, trainer, or teacher) with email and password
  // Multi-role support: Same email can have different roles (admin, trainer, teacher)
  app.post("/api/admin/users/create", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { email, password, name, role } = req.body;
      
      // Validate required fields
      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: "Email, password, name, and role are required" });
      }
      
      // Validate role
      if (!["admin", "trainer", "teacher"].includes(role)) {
        return res.status(400).json({ error: "Role must be admin, trainer, or teacher" });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(password);
      
      if (role === "teacher") {
        // Check if this email already has a teacher role (prevent duplicate teacher accounts)
        const existingTeachers = await storage.getAllTeachersByEmail(email);
        if (existingTeachers.length > 0) {
          return res.status(400).json({ error: "A teacher account with this email already exists. The same email can have admin, trainer, and teacher roles, but only one account per role." });
        }
        
        // Create teacher with approved status
        const teacher = await storage.createTeacher({
          name,
          email,
          password: hashedPassword,
          approvalStatus: "approved",
        });
        
        // Create initial report card
        await storage.upsertTeacherReportCard({
          teacherId: teacher.id,
          level: "Beginner",
          totalQuizzesTaken: 0,
          totalQuizzesPassed: 0,
          averageScore: 0,
        });
        
        const { password: _, ...teacherWithoutPassword } = teacher;
        res.status(201).json({ 
          ...teacherWithoutPassword, 
          role: "teacher",
          message: "Teacher created successfully" 
        });
      } else {
        // Check if this email already has an account with the SAME role (prevent duplicate role accounts)
        const existingUsers = await storage.getAllUsersByEmail(email);
        const existingWithSameRole = existingUsers.find(u => u.role === role);
        if (existingWithSameRole) {
          return res.status(400).json({ error: `A ${role} account with this email already exists. The same email can have admin, trainer, and teacher roles, but only one account per role.` });
        }
        
        // Generate a unique username for this role (email + role suffix for multi-role accounts)
        let username = email;
        const existingUsername = await storage.getUserByUsername(email);
        if (existingUsername) {
          // If username (email) already exists, append role to make it unique
          username = `${email}_${role}`;
        }
        
        // Create user (admin or trainer) - use email as username (or email_role if duplicate)
        const [newUser] = await db.insert(users).values({
          username,
          email,
          password: hashedPassword,
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' ') || undefined,
          role,
          approvalStatus: "approved",
          approvedBy: req.user!.id,
          approvedAt: new Date(),
        }).returning();
        
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ 
          ...userWithoutPassword, 
          message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully` 
        });
      }
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Get activity stats for a specific user
  app.get("/api/admin/users/:userId/activity", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Check if user is a trainer
      const trainer = await storage.getUser(userId);
      
      if (trainer && trainer.role === "trainer") {
        // Trainer stats
        const batches = await storage.getAllBatches(userId);
        const courseAssignments = await db
          .select({ count: sql`COUNT(DISTINCT ${batchCourses.courseId})::int` })
          .from(batchCourses)
          .where(eq(batchCourses.assignedBy, userId));
        
        res.json({
          userId,
          progressPercentage: 50,
          totalAssigned: batches.length,
          totalCompleted: batches.length,
          totalCourses: courseAssignments[0]?.count || 0,
          totalQuizzes: 0,
        });
        return;
      }
      
      // Teacher stats
      const teacher = await storage.getTeacher(userId);
      
      if (teacher) {
        const batches = await storage.getBatchesForTeacher(userId);
        const allAttempts = await storage.getAllTeacherQuizAttempts(userId);
        const passedQuizzes = allAttempts.filter((a: any) => a.passed).length;
        
        // Calculate completion percentage
        const totalAssigned = batches.length;
        const completions = await db
          .select({ count: sql`COUNT(*)::int` })
          .from(teacherCourseCompletion)
          .where(eq(teacherCourseCompletion.teacherId, userId));
        
        const progressPercentage = totalAssigned > 0 ? Math.round((Number(completions[0]?.count || 0)) / totalAssigned * 100) : 0;
        
        res.json({
          userId,
          progressPercentage,
          totalAssigned,
          totalCompleted: completions[0]?.count || 0,
          totalQuizzes: allAttempts.length,
          totalPassed: passedQuizzes,
        });
        return;
      }
      
      res.status(404).json({ error: "User not found" });
    } catch (error) {
      console.error("Error getting user activity:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dismiss/Delete a trainer (admin only)
  app.delete("/api/admin/dismiss-user/:userId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Delete the user from database
      const result = await storage.dismissUser(userId);
      
      if (!result) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true, message: "Trainer removed successfully" });
    } catch (error) {
      console.error("Error dismissing user:", error);
      res.status(500).json({ error: "Failed to remove trainer" });
    }
  });

  app.patch("/api/admin/teachers/:teacherId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!name && !email) return res.status(400).json({ error: "Name or email is required" });
      const teacher = await storage.updateTeacherProfile(req.params.teacherId, { name, email });
      if (!teacher) return res.status(404).json({ error: "Teacher not found" });
      const { password: _pw, ...safe } = teacher;
      res.json(safe);
    } catch (error) {
      console.error("Error updating teacher:", error);
      res.status(500).json({ error: "Failed to update teacher" });
    }
  });

  app.patch("/api/admin/trainers/:userId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!name && !email) return res.status(400).json({ error: "Name or email is required" });
      const trainer = await storage.updateUserProfile(req.params.userId, { name, email });
      if (!trainer || trainer.role !== "trainer") return res.status(404).json({ error: "Trainer not found" });
      const { password: _pw, ...safe } = trainer;
      res.json(safe);
    } catch (error) {
      console.error("Error updating trainer:", error);
      res.status(500).json({ error: "Failed to update trainer" });
    }
  });

  // Dismiss/Delete a teacher (admin only)
  app.delete("/api/admin/dismiss-teacher/:teacherId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { teacherId } = req.params;
      
      // Delete the teacher from database
      const result = await storage.dismissTeacher(teacherId);
      
      if (!result) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      res.json({ success: true, message: "Teacher removed successfully" });
    } catch (error) {
      console.error("Error dismissing teacher:", error);
      res.status(500).json({ error: "Failed to remove teacher" });
    }
  });

  // Restrict a trainer (admin only)
  app.post("/api/admin/restrict-user/:userId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Update user's approval status to 'restricted'
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update approval status to restricted
      await db.update(users).set({ approvalStatus: "restricted" }).where(eq(users.id, userId));
      
      res.json({ success: true, message: "Trainer restricted successfully" });
    } catch (error) {
      console.error("Error restricting user:", error);
      res.status(500).json({ error: "Failed to restrict trainer" });
    }
  });

  // Restrict a teacher (admin only)
  app.post("/api/admin/restrict-teacher/:teacherId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { teacherId } = req.params;
      
      // Update teacher's approval status to 'restricted'
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      // Update approval status to restricted
      await db.update(teachers).set({ approvalStatus: "restricted" }).where(eq(teachers.id, teacherId));
      
      res.json({ success: true, message: "Teacher restricted successfully" });
    } catch (error) {
      console.error("Error restricting teacher:", error);
      res.status(500).json({ error: "Failed to restrict teacher" });
    }
  });

  // Unrestrict a trainer (admin only)
  app.post("/api/admin/unrestrict-user/:userId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update approval status back to approved
      await db.update(users).set({ approvalStatus: "approved" }).where(eq(users.id, userId));
      
      res.json({ success: true, message: "Trainer unrestricted successfully" });
    } catch (error) {
      console.error("Error unrestricting user:", error);
      res.status(500).json({ error: "Failed to unrestrict trainer" });
    }
  });

  // Unrestrict a teacher (admin only)
  app.post("/api/admin/unrestrict-teacher/:teacherId", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { teacherId } = req.params;
      
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      
      // Update approval status back to approved
      await db.update(teachers).set({ approvalStatus: "approved" }).where(eq(teachers.id, teacherId));
      
      res.json({ success: true, message: "Teacher unrestricted successfully" });
    } catch (error) {
      console.error("Error unrestricting teacher:", error);
      res.status(500).json({ error: "Failed to unrestrict teacher" });
    }
  });

  // ==================== ENGAGEMENT TRACKING ====================

  // Fellow Reflection Endpoints

  // Submit a reflection (teacher auth)
  app.post("/api/teacher/reflections", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const { weekId, batchId, content, rating } = req.body;
      if (!weekId || !batchId || !content) {
        return res.status(400).json({ error: "weekId, batchId, and content are required" });
      }
      const reflection = await storage.createReflection({
        teacherId,
        weekId,
        batchId,
        content,
        rating: rating || null,
      });
      res.json(reflection);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: "Reflection already submitted for this week" });
      }
      console.error("Error creating reflection:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get own reflections (teacher auth)
  app.get("/api/teacher/reflections", isTeacherAuthenticated, async (req, res) => {
    try {
      const reflections = await storage.getReflectionsByTeacher(req.teacherId!);
      res.json(reflections);
    } catch (error) {
      console.error("Error getting reflections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get reflections for a week (trainer/admin)
  app.get("/api/reflections/week/:weekId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const reflections = await storage.getReflectionsByWeek(req.params.weekId);
      res.json(reflections);
    } catch (error) {
      console.error("Error getting week reflections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get reflections for a fellow (trainer/admin)
  app.get("/api/reflections/teacher/:teacherId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const reflections = await storage.getReflectionsByTeacher(req.params.teacherId);
      res.json(reflections);
    } catch (error) {
      console.error("Error getting teacher reflections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get reflection completion analytics (admin)
  app.get("/api/analytics/reflection-completion", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getReflectionCompletionRate(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting reflection completion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all reflections with submitter details (admin)
  app.get("/api/admin/reflections", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getAllReflectionsForAdmin();
      res.json(data);
    } catch (error) {
      console.error("Error getting all reflections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fellow Disqualification Endpoints

  // Disqualify a fellow (trainer/admin)
  app.post("/api/fellows/:teacherId/disqualify", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId } = req.params;
      const { batchId, reason } = req.body;
      if (!batchId || !reason) {
        return res.status(400).json({ error: "batchId and reason are required" });
      }
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      const disqualification = await storage.disqualifyFellow({
        teacherId,
        batchId,
        reason,
        disqualifiedBy: req.user!.id,
        disqualifiedByRole: req.user!.role,
      });
      res.json(disqualification);
    } catch (error) {
      console.error("Error disqualifying fellow:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get disqualified fellows list
  app.get("/api/fellows/disqualified", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getDisqualifiedFellows(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting disqualified fellows:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get disqualification rate analytics (admin)
  app.get("/api/analytics/disqualification-rate", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getDisqualificationRate();
      res.json(data);
    } catch (error) {
      console.error("Error getting disqualification rate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Satisfaction Score Endpoints

  // Submit a satisfaction score (any authenticated role)
  app.post("/api/satisfaction-scores", isAuthenticatedAny, async (req, res) => {
    try {
      const { type, targetId, targetType, batchId, weekId, score, comment } = req.body;
      const sessionTeacherId = (req.session as any)?.teacherId as string | undefined;
      const raterId = sessionTeacherId || req.user?.id;
      const raterRole = sessionTeacherId ? "teacher" : req.user?.role;
      if (!type || !raterId || !raterRole || !targetId || !targetType || !score) {
        return res.status(400).json({ error: "type, targetId, targetType, and score are required" });
      }
      if (score < 1 || score > 5) {
        return res.status(400).json({ error: "Score must be between 1 and 5" });
      }
      const result = await storage.createSatisfactionScore({
        type, raterId, raterRole, targetId, targetType,
        batchId: batchId || null, weekId: weekId || null,
        score, comment: comment || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating satisfaction score:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get satisfaction trends (admin)
  app.get("/api/analytics/satisfaction-trends", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getSatisfactionTrends(type, batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting satisfaction trends:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer Comment Endpoints

  // Add a comment for a fellow (trainer)
  app.post("/api/trainer/comments", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId, batchId, weekId, comment, category } = req.body;
      if (!teacherId || !comment) {
        return res.status(400).json({ error: "teacherId and comment are required" });
      }
      const result = await storage.createTrainerComment({
        trainerId: req.user!.id,
        teacherId,
        batchId: batchId || null,
        weekId: weekId || null,
        comment,
        category: category || "general",
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating trainer comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get comments for a fellow (trainer/admin)
  app.get("/api/trainer/comments/teacher/:teacherId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const comments = await storage.getTrainerCommentsByTeacher(req.params.teacherId);
      res.json(comments);
    } catch (error) {
      console.error("Error getting trainer comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all comments by current trainer
  app.get("/api/trainer/comments", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const comments = await storage.getTrainerCommentsByTrainer(req.user!.id);
      res.json(comments);
    } catch (error) {
      console.error("Error getting trainer comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Course Repetition Endpoints

  // Record a course repetition (trainer/admin)
  app.post("/api/course-repetitions", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId, courseId, batchId, repetitionNumber, reason } = req.body;
      if (!teacherId || !courseId || !batchId) {
        return res.status(400).json({ error: "teacherId, courseId, and batchId are required" });
      }
      const result = await storage.createCourseRepetition({
        teacherId,
        courseId,
        batchId,
        repetitionNumber: repetitionNumber || 1,
        reason: reason || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating course repetition:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get repetition rate analytics (admin)
  app.get("/api/analytics/repetition-rate", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getRepetitionRate(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting repetition rate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Engagement & Advanced Analytics Endpoints

  // Engagement analytics (admin)
  app.get("/api/analytics/engagement", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getEngagementAnalytics(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting engagement analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Week coverage analytics (admin)
  app.get("/api/analytics/week-coverage", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getWeekCoverageAnalytics(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting week coverage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/analytics/course-completion", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getCourseCompletionOverview(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting course completion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Best formed week analytics (admin)
  app.get("/api/analytics/best-formed-week", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getBestFormedWeekAnalytics();
      res.json(data);
    } catch (error) {
      console.error("Error getting best formed week:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Quiz performance analytics (admin)
  app.get("/api/analytics/quiz-performance", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const data = await storage.getQuizPerformanceAnalytics(batchId);
      res.json(data);
    } catch (error) {
      console.error("Error getting quiz performance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Course assignment tracking (admin)
  app.get("/api/analytics/course-assignments", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const data = await storage.getCourseAssignmentTracking();
      res.json(data);
    } catch (error) {
      console.error("Error getting course assignments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Attendance Endpoints
  // ══════════════════════════════════════════════════════════════

  // Bulk mark attendance for a batch (trainer/admin)
  app.post("/api/batches/:batchId/attendance", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId } = req.params;
      const { date, records } = req.body;
      // records: [{ teacherId, status, notes? }]
      if (!date || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "date and records array are required" });
      }
      const markerId = (req.user as any)?.id;
      const attendanceDate = new Date(`${date}T00:00:00.000Z`);
      const results = [];
      for (const record of records) {
        if (!record.teacherId || !record.status) continue;
        const result = await storage.upsertAttendanceRecord({
          teacherId: record.teacherId,
          batchId,
          date: attendanceDate,
          status: record.status,
          markedBy: markerId,
          notes: record.notes || null,
        });
        results.push(result);
      }
      res.json({ created: results.length, records: results });
    } catch (error) {
      console.error("Error marking attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch attendance records (trainer/admin)
  app.get("/api/batches/:batchId/attendance", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId } = req.params;
      const dateStr = req.query.date as string | undefined;
      const date = dateStr ? new Date(dateStr) : undefined;
      const records = await storage.getAttendanceByBatch(batchId, date);
      res.json(records);
    } catch (error) {
      console.error("Error getting batch attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch attendance summary per teacher (trainer/admin)
  app.get("/api/batches/:batchId/attendance/summary", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId } = req.params;
      const summary = await storage.getBatchAttendanceSummary(batchId);
      res.json(summary);
    } catch (error) {
      console.error("Error getting attendance summary:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/batches/:batchId/announce", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { title, message } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: "title and message are required" });
      }
      const enrolled = await storage.getTeachersInBatch(req.params.batchId);
      const created = [];
      for (const teacher of enrolled) {
        created.push(await storage.createNotification({
          recipientId: teacher.id,
          recipientType: "teacher",
          type: "general",
          title: String(title).slice(0, 120),
          message: String(message),
          metadata: { batchId: req.params.batchId },
        }));
      }
      res.json({ sent: created.length });
    } catch (error) {
      console.error("Error sending cohort announcement:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/batches/:batchId/announcements", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!staffCanAccessBatch(req.user, batch)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const result = await db.execute(sql`
        SELECT title, message, MIN(created_at) as created_at, COUNT(*)::int as recipients
        FROM notifications
        WHERE metadata->>'batchId' = ${req.params.batchId}
        GROUP BY title, message
        ORDER BY MIN(created_at) DESC
        LIMIT 30
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing announcements:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/attendance", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const teachers = await db.execute(sql`
        SELECT t.id, t.name, t.email, ar.status, ar.date, b.name AS batch_name
        FROM teachers t
        LEFT JOIN LATERAL (
          SELECT status, date, batch_id
          FROM attendance_records
          WHERE teacher_id = t.id
          ORDER BY date DESC
          LIMIT 1
        ) ar ON true
        LEFT JOIN batches b ON b.id = ar.batch_id
        WHERE COALESCE(t.approval_status, 'approved') <> 'inactive'
        ORDER BY t.name
      `);
      const trainers = await db.execute(sql`
        SELECT u.id, u.username, u.email, ta.status, ta.date, b.name AS batch_name
        FROM users u
        LEFT JOIN LATERAL (
          SELECT status, date, batch_id
          FROM trainer_attendance
          WHERE trainer_id = u.id
          ORDER BY date DESC
          LIMIT 1
        ) ta ON true
        LEFT JOIN batches b ON b.id = ta.batch_id
        WHERE u.role = 'trainer' AND COALESCE(u.approval_status, 'approved') <> 'inactive'
        ORDER BY u.username
      `);
      const cohorts = await db.execute(sql`SELECT id, name FROM batches ORDER BY name`);
      const asPerson = (row: any, role: "teacher" | "trainer") => ({
        id: row.id,
        name: row.name || row.username,
        role,
        detail: row.email || row.username || "",
        batchName: row.batch_name || null,
        status: row.status || null,
        date: row.date ? new Date(row.date).toISOString() : null,
      });
      res.json({
        teachers: teachers.rows.map((row) => asPerson(row, "teacher")),
        trainers: trainers.rows.map((row) => asPerson(row, "trainer")),
        cohorts: cohorts.rows,
      });
    } catch (error) {
      console.error("Error loading admin attendance:", error);
      res.status(500).json({ error: "Could not load attendance" });
    }
  });

  app.post("/api/admin/attendance", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const { role, personId, batchId, date, status } = req.body || {};
      if ((role !== "teacher" && role !== "trainer") || !personId || !batchId || !date || !isAttendanceStatus(status)) {
        return res.status(400).json({ error: "Choose a teacher or trainer, a cohort, a date, and a status." });
      }
      const attendanceDate = new Date(`${date}T00:00:00.000Z`);
      if (Number.isNaN(attendanceDate.getTime())) {
        return res.status(400).json({ error: "That date is not valid." });
      }
      if (role === "teacher") {
        await storage.upsertAttendanceRecord({
          teacherId: personId,
          batchId,
          date: attendanceDate,
          status,
          markedBy: req.user!.id,
          notes: null,
        });
      } else {
        await db.execute(sql`
          INSERT INTO trainer_attendance (trainer_id, batch_id, date, status, marked_by)
          VALUES (${personId}, ${batchId}, ${attendanceDate}, ${status}, ${req.user!.id})
          ON CONFLICT (trainer_id, batch_id, date)
          DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by
        `);
      }
      res.json({ saved: true });
    } catch (error) {
      console.error("Error saving admin attendance:", error);
      res.status(500).json({ error: "Could not save attendance" });
    }
  });

  // Get own attendance (teacher auth)
  app.get("/api/teacher/attendance", isTeacherAuthenticated, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const records = await storage.getAttendanceByTeacher(req.teacherId!, batchId);
      res.json(records);
    } catch (error) {
      console.error("Error getting teacher attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get own attendance summary (teacher auth)
  app.get("/api/teacher/attendance/summary", isTeacherAuthenticated, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const summary = await storage.getAttendanceSummary(req.teacherId!, batchId);
      res.json(summary);
    } catch (error) {
      console.error("Error getting attendance summary:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Notification Endpoints
  // ══════════════════════════════════════════════════════════════

  // Get own notifications (any authenticated user)
  app.get("/api/desk-messages", isAuthenticatedAny, async (req, res) => {
    try {
      const withId = String(req.query.withId || "");
      if (!withId) return res.status(400).json({ error: "withId is required" });
      const meId = req.teacherId || (req.user as any)?.id;
      if (!meId) return res.status(401).json({ error: "Not authenticated" });
      const thread = await storage.getDeskThread(meId, withId);
      res.json(thread);
    } catch (error) {
      console.error("Error listing desk messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/desk-messages", isAuthenticatedAny, async (req, res) => {
    try {
      const body = String(req.body?.body || "").trim();
      const toId = String(req.body?.toId || "").trim();
      const toRole = String(req.body?.toRole || "").trim();
      if (!body || !toId || !toRole) {
        return res.status(400).json({ error: "toId, toRole, and body are required" });
      }
      const fromId = req.teacherId || (req.user as any)?.id;
      const fromRole = req.teacherId ? "teacher" : (req.user as any)?.role;
      const fromName = req.teacherId
        ? String((req as any).teacherName || "Teacher")
        : `${(req.user as any)?.firstName || ""} ${(req.user as any)?.lastName || ""}`.trim() || (req.user as any)?.username || "Staff";
      if (!fromId || !fromRole) return res.status(401).json({ error: "Not authenticated" });
      const row = await storage.createDeskMessage({ fromId, fromRole, fromName, toId, toRole, body: body.slice(0, 2000) });
      await storage.createNotification({
        recipientId: toId,
        recipientType: toRole,
        type: "general",
        title: "New desk message",
        message: body.slice(0, 160),
        metadata: { fromId, fromRole },
      });
      res.status(201).json(row);
    } catch (error) {
      console.error("Error sending desk message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/notifications", isAuthenticatedAny, async (req, res) => {
    try {
      const user = req.user as any;
      let recipientId: string;
      let recipientType: string;
      if (req.teacherId) {
        recipientId = req.teacherId;
        recipientType = "teacher";
      } else if (user?.id) {
        recipientId = user.id;
        recipientType = user.role || "admin";
      } else {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const notifs = await storage.getNotifications(recipientId, recipientType, limit);
      res.json(notifs);
    } catch (error) {
      console.error("Error getting notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get unread notification count (any authenticated user)
  app.get("/api/notifications/unread-count", isAuthenticatedAny, async (req, res) => {
    try {
      const user = req.user as any;
      let recipientId: string;
      let recipientType: string;
      if (req.teacherId) {
        recipientId = req.teacherId;
        recipientType = "teacher";
      } else if (user?.id) {
        recipientId = user.id;
        recipientType = user.role || "admin";
      } else {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const count = await storage.getUnreadNotificationCount(recipientId, recipientType);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark a notification as read (any authenticated user)
  app.post("/api/notifications/:id/read", isAuthenticatedAny, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark all notifications as read (any authenticated user)
  app.post("/api/notifications/read-all", isAuthenticatedAny, async (req, res) => {
    try {
      const user = req.user as any;
      let recipientId: string;
      let recipientType: string;
      if (req.teacherId) {
        recipientId = req.teacherId;
        recipientType = "teacher";
      } else if (user?.id) {
        recipientId = user.id;
        recipientType = user.role || "admin";
      } else {
        return res.status(401).json({ error: "Not authenticated" });
      }
      await storage.markAllNotificationsRead(recipientId, recipientType);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send a manual notification (trainer/admin)
  app.post("/api/notifications", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { recipientId, recipientType, type, title, message, metadata } = req.body;
      if (!recipientId || !recipientType || !title || !message) {
        return res.status(400).json({ error: "recipientId, recipientType, title, and message are required" });
      }
      const notification = await storage.createNotification({
        recipientId,
        recipientType,
        type: type || "general",
        title,
        message,
        metadata: metadata || null,
      });
      res.json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Alert Rule Endpoints
  // ══════════════════════════════════════════════════════════════

  // Create alert rule (trainer/admin)
  app.post("/api/alert-rules", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId, ruleType, threshold } = req.body;
      if (!ruleType || threshold === undefined) {
        return res.status(400).json({ error: "ruleType and threshold are required" });
      }
      const rule = await storage.createAlertRule({
        batchId: batchId || null,
        ruleType,
        threshold,
        createdBy: (req.user as any)?.id,
      });
      res.json(rule);
    } catch (error) {
      console.error("Error creating alert rule:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get alert rules (trainer/admin)
  app.get("/api/alert-rules", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batchId = req.query.batchId as string | undefined;
      const rules = await storage.getAlertRules(batchId);
      res.json(rules);
    } catch (error) {
      console.error("Error getting alert rules:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete alert rule (trainer/admin)
  app.delete("/api/alert-rules/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      await storage.deleteAlertRule(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert rule:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Teacher Goal Endpoints
  // ══════════════════════════════════════════════════════════════

  // Create goal (teacher auth)
  app.post("/api/teacher/goals", isTeacherAuthenticated, async (req, res) => {
    try {
      const { goalText, batchId, dueDate } = req.body;
      if (!goalText) {
        return res.status(400).json({ error: "goalText is required" });
      }
      const goal = await storage.createTeacherGoal({
        teacherId: req.teacherId!,
        batchId: batchId || null,
        goalText,
        dueDate: dueDate ? new Date(dueDate) : null,
      });
      res.json(goal);
    } catch (error) {
      console.error("Error creating goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get own goals (teacher auth)
  app.get("/api/teacher/goals", isTeacherAuthenticated, async (req, res) => {
    try {
      const goals = await storage.getTeacherGoals(req.teacherId!);
      res.json(goals);
    } catch (error) {
      console.error("Error getting goals:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update goal (teacher auth)
  app.patch("/api/teacher/goals/:id", isTeacherAuthenticated, async (req, res) => {
    try {
      const updates: any = {};
      if (req.body.goalText) updates.goalText = req.body.goalText;
      if (req.body.status) {
        updates.status = req.body.status;
        if (req.body.status === 'completed') {
          updates.completedAt = new Date();
        }
      }
      if (req.body.dueDate !== undefined) {
        updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      }
      const goal = await storage.updateTeacherGoal(req.params.id, updates);
      res.json(goal);
    } catch (error) {
      console.error("Error updating goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete goal (teacher auth)
  app.delete("/api/teacher/goals/:id", isTeacherAuthenticated, async (req, res) => {
    try {
      await storage.deleteTeacherGoal(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting goal:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/batches/:batchId/teachers/import-csv", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });

      const csv = String(req.body?.csv || "");
      const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) return res.status(400).json({ error: "CSV is empty" });

      const parseRow = (line: string) => {
        const cells: string[] = [];
        let current = "";
        let quoted = false;
        for (const ch of line) {
          if (ch === '"') quoted = !quoted;
          else if (ch === "," && !quoted) {
            cells.push(current.trim());
            current = "";
          } else current += ch;
        }
        cells.push(current.trim());
        return cells.map((cell) => cell.replace(/^"|"$/g, ""));
      };

      let start = 0;
      const header = parseRow(lines[0]).map((h) => h.toLowerCase());
      if (header.includes("email") || header.includes("name")) start = 1;
      const emailIdx = header.includes("email") ? header.indexOf("email") : 1;
      const nameIdx = header.includes("name") ? header.indexOf("name") : 0;
      const passwordIdx = header.includes("password") ? header.indexOf("password") : -1;

      let created = 0;
      let enrolled = 0;
      let skipped = 0;
      const errors: string[] = [];
      const alreadyIn = new Set((await storage.getTeachersInBatch(batch.id)).map((t) => t.id));

      for (let i = start; i < lines.length; i++) {
        const cells = parseRow(lines[i]);
        const name = cells[nameIdx] || cells[0];
        const email = (cells[emailIdx] || cells[1] || "").trim().toLowerCase();
        const password = passwordIdx >= 0 ? cells[passwordIdx] : "Teacher123!";
        if (!email || !email.includes("@")) {
          errors.push(`Row ${i + 1}: missing email`);
          continue;
        }
        try {
          let teacher = await storage.getTeacherByEmail(email);
          if (!teacher) {
            teacher = await storage.createTeacher({
              name: name || email.split("@")[0],
              email,
              password: await hashPassword(password.length >= 6 ? password : "Teacher123!"),
              approvalStatus: "approved",
            });
            created++;
          }
          if (alreadyIn.has(teacher.id)) {
            skipped++;
            continue;
          }
          await storage.addTeacherToBatch({ batchId: batch.id, teacherId: teacher.id });
          alreadyIn.add(teacher.id);
          enrolled++;
          await notifyTeacher(
            teacher.id,
            "You're in",
            `You have been added to ${batch.name}. Open your dashboard to continue learning.`,
            "general",
            { batchId: batch.id },
          );
        } catch (error: any) {
          if (String(error?.message || "").includes("duplicate") || String(error?.code) === "23505") {
            skipped++;
          } else {
            errors.push(`Row ${i + 1}: ${error?.message || "failed"}`);
          }
        }
      }

      res.json({ created, enrolled, skipped, errors });
    } catch (error) {
      console.error("CSV import failed:", error);
      res.status(500).json({ error: "Failed to import roster" });
    }
  });

  app.get("/api/batches/:batchId/assignments", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      res.json(await storage.getWrittenAssignments(req.params.batchId));
    } catch (error) {
      console.error("Error listing assignments:", error);
      res.status(500).json({ error: "Failed to list assignments" });
    }
  });

  app.post("/api/batches/:batchId/assignments", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const { title, instructions, dueDate, fileUrl, fileName, kind } = req.body;
      const assignmentKind = kind === "assessment" ? "assessment" : "assignment";
      if (!title || (!instructions && !fileUrl)) return res.status(400).json({ error: "title and instructions are required" });
      const audience = await resolveQuizAudience(batch.id, req.body?.teacherIds);
      if (audience.error) return res.status(400).json({ error: audience.error });
      const assignment = await storage.createWrittenAssignment({
        batchId: batch.id,
        title,
        instructions: instructions || (assignmentKind === "assessment" ? "Open the assessment and write your answers." : "Open the assignment and write your answers."),
        dueDate: parseDeadline(dueDate),
        createdBy: req.user!.id,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        kind: assignmentKind,
      });
      await storage.replaceWrittenAssignmentAudience(assignment.id, audience.teacherIds);
      notifyQuizTeachers(
        batch.id,
        audience.teacherIds,
        "Written work is ready",
        `${title} is waiting in ${batch.name}. Open Work on your dashboard.`,
      ).catch((error) => console.error("Assignment notice failed:", error));
      res.status(201).json({ ...assignment, teacherIds: audience.teacherIds });
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  app.patch("/api/batches/:batchId/assignments/:assignmentId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const assignment = await storage.getWrittenAssignment(req.params.assignmentId);
      if (!assignment || assignment.batchId !== batch.id) return res.status(404).json({ error: "Assignment not found" });
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, "dueDate")) {
        return res.status(400).json({ error: "dueDate is required" });
      }
      const updated = await storage.updateWrittenAssignment(assignment.id, { dueDate: parseDeadline(req.body.dueDate) });
      const due = parseDeadline(req.body.dueDate);
      const audience = (await storage.getWrittenAssignmentAudienceMap([assignment.id]))[assignment.id] || [];
      notifyQuizTeachers(
        batch.id,
        audience,
        "Deadline updated",
        due
          ? `${assignment.title} is now due ${due.toLocaleString()}.`
          : `${assignment.title} no longer has a deadline.`,
      ).catch((error) => console.error("Assignment deadline notice failed:", error));
      res.json(updated);
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  app.get("/api/batches/:batchId/assignments/:assignmentId/submissions", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const assignment = await storage.getWrittenAssignment(req.params.assignmentId);
      if (!batch || !assignment || assignment.batchId !== batch.id) return res.status(404).json({ error: "Assignment not found" });
      res.json(await storage.getAssignmentRoster(assignment));
    } catch (error) {
      console.error("Error listing submissions:", error);
      res.status(500).json({ error: "Failed to list submissions" });
    }
  });

  app.patch("/api/batches/:batchId/assignments/:assignmentId/submissions/:teacherId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const assignment = await storage.getWrittenAssignment(req.params.assignmentId);
      if (!batch || !assignment || assignment.batchId !== batch.id) return res.status(404).json({ error: "Assignment not found" });
      const score = req.body?.trainerScore == null || req.body?.trainerScore === ""
        ? null
        : Number(req.body.trainerScore);
      if (score != null && (Number.isNaN(score) || score < 0 || score > 100)) {
        return res.status(400).json({ error: "trainerScore must be 0–100" });
      }
      const comment = req.body?.trainerComment != null ? String(req.body.trainerComment) : null;
      const row = await storage.reviewAssignmentSubmission(
        req.params.assignmentId,
        req.params.teacherId,
        score,
        comment,
        req.body?.rubric ?? null,
      );
      if (!row) return res.status(404).json({ error: "Submission not found" });
      notifyTeacher(
        req.params.teacherId,
        "Written work marked",
        comment ? `Score ${score ?? "—"}. ${comment}` : `Your written work was marked${score != null ? `: ${score}` : ""}.`,
        "general",
        { batchId: req.params.batchId, assignmentId: req.params.assignmentId },
      ).catch((error) => console.error("Mark notice failed:", error));
      res.json(row);
    } catch (error) {
      console.error("Error reviewing submission:", error);
      res.status(500).json({ error: "Failed to review submission" });
    }
  });

  // Module discussion (D11): Fellows in an open cohort that holds the module's course, and staff in scope.
  // A Fellow or trainer sees posts from Fellows in those cohorts only (`discussionAccess`).
  app.get("/api/weeks/:weekId/discussions", isAuthenticatedAny, async (req, res) => {
    try {
      const week = await storage.getTrainingWeek(req.params.weekId);
      if (!week) return res.status(404).json({ error: "Module not found" });
      const access = await discussionAccess({ teacherId: req.teacherId, user: req.user }, week.courseId);
      if (!access.ok) return res.status(access.refusal.status).json(access.refusal.body);
      res.json(visibleDiscussionPosts(await storage.listDiscussionPosts(req.params.weekId), access.authors));
    } catch (error) {
      console.error("Error listing discussion:", error);
      res.status(500).json({ error: "Failed to list discussion" });
    }
  });

  app.post("/api/weeks/:weekId/discussions", isAuthenticatedAny, async (req, res) => {
    try {
      const body = String(req.body?.body || "").trim();
      if (!body) return res.status(400).json({ error: "body is required" });
      const week = await storage.getTrainingWeek(req.params.weekId);
      if (!week) return res.status(404).json({ error: "Module not found" });
      const access = await discussionAccess({ teacherId: req.teacherId, user: req.user }, week.courseId);
      if (!access.ok) return res.status(access.refusal.status).json(access.refusal.body);
      let authorId = req.teacherId || req.user?.id || "";
      let authorRole = req.teacherId ? "teacher" : (req.user?.role || "trainer");
      let authorName = req.user?.username || "Staff";
      if (req.teacherId) {
        const teacher = await storage.getTeacher(req.teacherId);
        authorName = teacher?.name || "Fellow";
      } else if (req.user) {
        authorName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.username || "Staff";
      }
      if (!authorId) return res.status(401).json({ error: "Unauthorized" });
      const row = await storage.createDiscussionPost({
        weekId: req.params.weekId,
        authorId,
        authorRole,
        authorName,
        body,
      });
      res.status(201).json(row);
    } catch (error) {
      console.error("Error posting discussion:", error);
      res.status(500).json({ error: "Failed to post" });
    }
  });

  app.get("/api/teacher/assignments", isTeacherAuthenticated, async (req, res) => {
    try {
      const rows = (await storage.getWrittenAssignmentsForTeacher(req.teacherId!)) as any[];
      const now = new Date();
      res.json(rows.filter((row) => fellowStillSees(row.due_date, Boolean(row.my_response), now)));
    } catch (error) {
      console.error("Error listing teacher assignments:", error);
      res.status(500).json({ error: "Failed to list assignments" });
    }
  });

  app.post("/api/teacher/assignments/:assignmentId/submit", isTeacherAuthenticated, async (req, res) => {
    try {
      const response = String(req.body?.response || "").trim();
      if (!response) return res.status(400).json({ error: "response is required" });
      if (!(await storage.teacherCanSeeAssignment(req.params.assignmentId, req.teacherId!))) {
        return res.status(403).json({ error: "This work is not assigned to you" });
      }
      const assignment = await storage.getWrittenAssignment(req.params.assignmentId);
      if (isPastDue(assignment?.dueDate)) return res.status(410).json({ error: DEADLINE_PASSED });
      const row = await storage.upsertAssignmentSubmission(req.params.assignmentId, req.teacherId!, response);
      res.json(row);
    } catch (error) {
      console.error("Error submitting assignment:", error);
      res.status(500).json({ error: "Failed to submit assignment" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Scheduled Event Endpoints
  // ══════════════════════════════════════════════════════════════

  // Create event (trainer/admin). A Trainer schedules only for a cohort they teach.
  app.post("/api/batches/:batchId/events", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId } = req.params;
      const { title, description, eventType, startDate, endDate } = req.body;
      if (!title || !eventType || !startDate) {
        return res.status(400).json({ error: "title, eventType, and startDate are required" });
      }
      const batch = await storage.getBatch(batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : null;
      if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
        return res.status(400).json({ error: "The date is not a date" });
      }
      if (end && end.getTime() < start.getTime()) return res.status(400).json({ error: "The session ends before it starts" });
      const online = parseOnlineFields(req.body, req.user as any);
      if ("error" in online) return res.status(online.error.startsWith("Only") ? 403 : 400).json({ error: online.error });
      const event = await storage.createScheduledEvent({
        title,
        description: description || null,
        eventType,
        startDate: start,
        endDate: end,
        batchId,
        createdBy: (req.user as any)?.id,
        ...online,
      });
      notifyBatchTeachers(
        batchId,
        "New on the calendar",
        `${title} is scheduled for this cohort.`,
        eventType === "deadline" ? "deadline" : "session_reminder",
      ).catch((error) => console.error("Calendar notice failed:", error));
      res.json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch events (trainer/admin)
  app.get("/api/batches/:batchId/events", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const events = await storage.getScheduledEvents(req.params.batchId);
      res.json(events);
    } catch (error) {
      console.error("Error getting events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Edit a session (trainer/admin). The same rules as scheduling it; a Trainer edits only in a cohort they teach.
  // Someone who may not add links (an in-house Trainer) can still move or rename a session: its links are kept as they are.
  app.patch("/api/events/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const [event] = await db.select().from(scheduledEvents).where(eq(scheduledEvents.id, req.params.id));
      if (!event) return res.status(404).json({ error: "Event not found" });
      const batch = await storage.getBatch(event.batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      const { title, description, eventType, startDate, endDate } = req.body || {};
      if (!title || !eventType || !startDate) {
        return res.status(400).json({ error: "title, eventType, and startDate are required" });
      }
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : null;
      if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
        return res.status(400).json({ error: "The date is not a date" });
      }
      if (end && end.getTime() < start.getTime()) return res.status(400).json({ error: "The session ends before it starts" });
      const online = canRunOnlineSessions(req.user as any)
        ? parseOnlineFields(req.body, req.user as any)
        : { meetingUrl: event.meetingUrl, videoUrl: event.videoUrl, materialsUrl: event.materialsUrl };
      if ("error" in online) return res.status(400).json({ error: online.error });
      const updated = await storage.updateScheduledEvent(event.id, {
        title,
        description: description || null,
        eventType,
        startDate: start,
        endDate: end,
        ...online,
      });
      notifyBatchTeachers(
        batch.id,
        "Session changed",
        `${title} has changed. Open Calendar to see when and where.`,
        "session_reminder",
      ).catch((error) => console.error("Calendar notice failed:", error));
      res.json(updated);
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete event (trainer/admin). A Trainer removes only sessions in a cohort they teach.
  app.delete("/api/events/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const [event] = await db.select().from(scheduledEvents).where(eq(scheduledEvents.id, req.params.id));
      if (!event) return res.status(404).json({ error: "Event not found" });
      const batch = await storage.getBatch(event.batchId);
      if (!staffCanAccessBatch(req.user, batch)) return res.status(403).json({ error: "Access denied" });
      await storage.deleteScheduledEvent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher events from their batches (teacher auth)
  app.get("/api/teacher/events", isTeacherAuthenticated, async (req, res) => {
    try {
      const events = await storage.getScheduledEventsForTeacher(req.teacherId!);
      res.json(events);
    } catch (error) {
      console.error("Error getting teacher events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Teacher-Facing Data Endpoints
  // ══════════════════════════════════════════════════════════════

  // Get own trainer comments (teacher auth) - read only
  app.get("/api/teacher/trainer-comments", isTeacherAuthenticated, async (req, res) => {
    try {
      const comments = await storage.getTrainerCommentsByTeacher(req.teacherId!);
      res.json(comments);
    } catch (error) {
      console.error("Error getting trainer comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get improvement tips based on teacher's performance (teacher auth)
  app.get("/api/teacher/improvement-tips", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;

      // Gather data for tips computation
      const [attendanceSummary, quizAttemptsResult, reflections] = await Promise.all([
        storage.getAttendanceSummary(teacherId),
        db.execute(sql`SELECT * FROM teacher_quiz_attempts WHERE teacher_id = ${teacherId}`),
        storage.getReflectionsByTeacher(teacherId),
      ]);
      const quizAttempts = quizAttemptsResult.rows;

      const tips: Array<{ text: string; priority: 'high' | 'medium' | 'low' }> = [];

      // Attendance tip
      const attendanceRate = parseFloat(attendanceSummary?.attendance_rate || '0');
      if (attendanceRate < 80) {
        tips.push({ text: "Your attendance rate is below 80%. Regular attendance is key to completing your training successfully.", priority: "high" });
      } else if (attendanceRate < 95) {
        tips.push({ text: "Good attendance! Try to maintain consistent attendance for the best results.", priority: "low" });
      }

      // Quiz performance tip
      if (quizAttempts.length > 0) {
        const passCount = quizAttempts.filter((a: any) => a.passed === 'yes').length;
        const passRate = (passCount / quizAttempts.length) * 100;
        if (passRate < 60) {
          tips.push({ text: "Your quiz pass rate needs improvement. Review the training materials before attempting quizzes.", priority: "high" });
        } else if (passRate < 80) {
          tips.push({ text: "You're doing well on quizzes! Focus on areas where you scored lower to boost your pass rate.", priority: "medium" });
        }
      } else {
        tips.push({ text: "Start taking quizzes to assess your understanding of the training materials.", priority: "medium" });
      }

      // Reflection tip
      if (reflections.length === 0) {
        tips.push({ text: "Submit weekly reflections to track your growth and show your engagement with the training.", priority: "medium" });
      }

      res.json(tips);
    } catch (error) {
      console.error("Error computing improvement tips:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get progress summary including graduation probability (teacher auth)
  app.get("/api/teacher/progress-summary", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;

      const [attendanceSummary, quizAttemptsResult, reflections, contentResult] = await Promise.all([
        storage.getAttendanceSummary(teacherId),
        db.execute(sql`SELECT * FROM teacher_quiz_attempts WHERE teacher_id = ${teacherId}`),
        storage.getReflectionsByTeacher(teacherId),
        db.execute(sql`SELECT * FROM teacher_content_progress WHERE teacher_id = ${teacherId}`),
      ]);
      const quizAttempts = quizAttemptsResult.rows;
      const contentProgress = contentResult.rows;

      // Content completion
      const contentCount = contentProgress.length;
      const completedContent = contentProgress.filter((p: any) => p.status === 'completed').length;
      const contentRate = contentCount > 0 ? (completedContent / contentCount) * 100 : 0;

      // Quiz pass rate
      const totalQuizzes = quizAttempts.length;
      const passedQuizzes = quizAttempts.filter((a: any) => a.passed === 'yes').length;
      const quizPassRate = totalQuizzes > 0 ? (passedQuizzes / totalQuizzes) * 100 : 0;

      // Attendance rate
      const attendanceRate = parseFloat(attendanceSummary?.attendance_rate || '0');

      // Reflection completion (rough estimate based on active weeks)
      const reflectionCount = reflections.length;

      // Graduation probability (weighted: content 40% + quiz 30% + attendance 20% + reflections 10%)
      const reflectionScore = Math.min(reflectionCount * 10, 100); // cap at 100
      const graduationProbability = Math.round(
        contentRate * 0.4 + quizPassRate * 0.3 + attendanceRate * 0.2 + reflectionScore * 0.1
      );

      res.json({
        contentCompletion: Math.round(contentRate),
        quizPassRate: Math.round(quizPassRate),
        attendanceRate: Math.round(attendanceRate),
        reflectionCount,
        graduationProbability: Math.min(graduationProbability, 100),
        totalQuizzes,
        passedQuizzes,
        totalContent: contentCount,
        completedContent,
      });
    } catch (error) {
      console.error("Error getting progress summary:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ops/catalog", isAuthenticated, isTrainer, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT a.id AS area, a.title, a.description, m.table_name
        FROM ops.table_map m
        JOIN ops.areas a ON a.id = m.area_id
        ORDER BY a.id, m.table_name
      `);
      res.json(result.rows);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/reports/batches/:batchId.csv", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch || !staffCanAccessBatch(req.user, batch)) {
        return res.status(404).json({ error: "Batch not found" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      const assignedCourses = await storage.getCoursesForBatch(req.params.batchId);
      const lines = [
        "learner,email,courses_assigned,courses_completed,overall_percent,status",
      ];
      for (const teacher of teachers) {
        const completions = await db
          .select()
          .from(teacherCourseCompletion)
          .where(and(eq(teacherCourseCompletion.teacherId, teacher.id), eq(teacherCourseCompletion.batchId, req.params.batchId)));
        const completed = completions.filter((c) => c.status === "completed").length;
        const overall = assignedCourses.length > 0 ? Math.round((completed / assignedCourses.length) * 100) : 0;
        const status = overall >= 100 ? "Completed" : overall > 0 ? "In Progress" : "Not Started";
        const safe = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
        lines.push([safe(teacher.name), safe(teacher.email), assignedCourses.length, completed, overall, status].join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${batch.name.replace(/[^a-z0-9]+/gi, "-")}-cohort.csv"`);
      res.send(lines.join("\n"));
    } catch (error) {
      console.error("cohort csv:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/reports/courses/:courseId.csv", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.courseId);
      if (!course) return res.status(404).json({ error: "Course not found" });
      const rows = await db
        .select()
        .from(teacherCourseCompletion)
        .where(eq(teacherCourseCompletion.courseId, req.params.courseId));
      const lines = ["teacher_id,status,completed_weeks,total_weeks,percent"];
      for (const row of rows) {
        const percent = row.totalWeeks ? Math.round((row.completedWeeks / row.totalWeeks) * 100) : row.status === "completed" ? 100 : 0;
        lines.push([row.teacherId, row.status, row.completedWeeks, row.totalWeeks, percent].join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${course.name.replace(/[^a-z0-9]+/gi, "-")}-course.csv"`);
      res.send(lines.join("\n"));
    } catch (error) {
      console.error("course csv:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  registerAcademyPathRoutes(app, isAuthenticated, isAdmin, isTeacherAuthenticated);
  registerAcademyDeskRoutes(app, isAuthenticated, isTrainer, isAdmin);

  const httpServer = createServer(app);
  return httpServer;
}
