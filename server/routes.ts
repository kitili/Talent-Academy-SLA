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
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { insertTrainingWeekSchema, updateTrainingWeekSchema, users, teachers, batches, batchCourses, batchTeachers, courses, teacherCourseCompletion, assignedQuizzes, quizAttempts } from "@shared/schema";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { setupTeacherAuth, isTeacherAuthenticated } from "./teacherAuth";
import { z } from "zod";
import * as mammoth from "mammoth";
import { db } from "./db";
import { eq, and, or, sql, asc } from "drizzle-orm";
import { applyModuleLocks, moduleIsComplete } from "./progressLogic";

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
    const database = Boolean(
      process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL,
    );
    const sessionSecret = Boolean(process.env.SESSION_SECRET);
    const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
    res.status(ok ? 200 : 503).json({
      ok,
      database,
      databaseReachable,
      sessionSecret,
      blob,
    });
  });

  // Setup authentication (username/password)
  setupAuth(app);
  setupTeacherAuth(app);
  // Note: /api/register, /api/login, /api/logout, /api/user are now in auth.ts
  // Note: /api/teacher/* routes are in teacherAuth.ts

  // Emergency admin password reset (no login required - uses secret key)
  const emergencyResetSchema = z.object({
    masterKey: z.string().min(1, "Master key required"),
    username: z.string().trim().min(1, "Username required"),
    newPassword: z.string().trim().min(6, "Password must be at least 6 characters"),
  });

  app.post("/api/emergency-admin-reset", async (req, res) => {
    try {
      const masterKey = process.env.ADMIN_RESET_KEY;
      
      if (!masterKey) {
        return res.status(503).json({ error: "Emergency reset not configured. Set ADMIN_RESET_KEY environment variable." });
      }
      
      const { masterKey: providedKey, username, newPassword } = emergencyResetSchema.parse(req.body);
      
      if (providedKey !== masterKey) {
        return res.status(403).json({ error: "Invalid master key" });
      }
      
      // Find the user
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Hash and update password
      const hashedPassword = await hashPassword(newPassword);
      const updatedUser = await storage.updateUserPassword(user.id, hashedPassword);

      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      // Sync password to linked teacher accounts with the same email
      if (updatedUser.email) {
        await storage.syncPasswordByEmail(updatedUser.email, hashedPassword, 'users');
      }

      res.json({
        success: true,
        message: `Password reset successful for: ${updatedUser.username}`
      });
    } catch (error) {
      console.error("Error in emergency password reset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
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
  app.get("/api/training-weeks", isAuthenticated, async (req, res) => {
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
      const validated = updateTrainingWeekSchema.parse({
        ...req.body,
        id: req.params.id,
      });
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

      // Renumber all weeks sequentially
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

      const week = await storage.getTrainingWeek(req.params.id);
      if (!week) {
        console.log("[UPLOAD DEBUG] Week not found:", req.params.id);
        return res.status(404).json({ error: "Training week not found" });
      }

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
      
      // 🚀 PRE-CACHE: Generate quiz questions in background (non-blocking)
      // Admin gets instant response, students get instant quiz delivery later
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
                approved: true,
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

      const week = await storage.getTrainingWeek(id);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

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

      const week = await storage.getTrainingWeek(id);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

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
  app.get("/api/files/view-url", isAuthenticated, async (req, res) => {
    try {
      const { fileUrl } = req.query;
      if (!fileUrl || typeof fileUrl !== 'string') {
        return res.status(400).json({ error: "fileUrl parameter required" });
      }

      // Return a proxied URL that will serve the file through our backend
      const encodedUrl = encodeURIComponent(fileUrl);
      const viewUrl = `/api/files/proxy?url=${encodedUrl}`;
      
      res.json({ viewUrl });
    } catch (error) {
      console.error("Error generating view URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Proxy file requests to make them publicly accessible for Office viewer
  app.get("/api/files/proxy", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url parameter required" });
      }

      const buffer = await objectStorageService.getObjectEntity(url);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
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
  app.get("/api/files/convert-to-html", isAuthenticated, async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "url parameter required" });
      }

      const buffer = await objectStorageService.getObjectEntity(url);
      
      const result = await mammoth.convertToHtml({ buffer });
      
      res.setHeader('Content-Type', 'application/json');
      res.json({ 
        html: result.value,
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
  app.post("/api/training-weeks/:weekId/files/:fileId/generate-quiz", isAuthenticatedAny, async (req, res) => {
    try {
      const startTime = Date.now();
      console.log("[FILE-QUIZ] Starting quiz generation for file:", req.params.fileId);
      const { weekId, fileId } = req.params;
      const { numQuestions = 5, force = false } = req.body;
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

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
          return res.json({ questions: cachedQuiz.questions.slice(0, numQuestions), cached: true });
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
      const savedQuiz = await storage.saveCachedQuiz({
        weekId,
        deckFileId: fileId,
        questions,
        approved: true,
      });
      console.log(`[FILE-QUIZ] ✅ Successfully saved quiz, cached questions count:`, savedQuiz.questions.length);

      const totalTime = Date.now() - startTime;
      console.log(`[FILE-QUIZ] ✅ Generated and cached ${questions.length} questions in ${totalTime}ms`);
      res.json({ questions, cached: false });
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
            await storage.saveCachedQuiz({ weekId: item.weekId, deckFileId: item.fileId, questions, approved: true });
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
  app.post("/api/training-weeks/:weekId/files/:fileId/regenerate-quiz-admin", isAuthenticated, async (req, res) => {
    try {
      const { weekId, fileId } = req.params;
      const week = await storage.getTrainingWeek(weekId);
      if (!week) return res.status(404).json({ error: "Week not found" });
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
      await storage.saveCachedQuiz({ weekId, deckFileId: fileId, questions, approved: true });
      res.json({ success: true, questionCount: questions.length });
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
      const { questions, answers } = req.body;

      if (!questions || !Array.isArray(questions) || !answers || typeof answers !== 'object') {
        return res.status(400).json({ error: "Invalid quiz submission" });
      }

      // Defensive check: Verify the file belongs to this week
      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }
      const fileExists = week.deckFiles?.some(f => f.id === fileId);
      if (!fileExists) {
        return res.status(400).json({ error: "File does not belong to this training week" });
      }

      const { scoreQuizSubmission } = await import("./quizService");
      const graded = scoreQuizSubmission(questions, answers);
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
        attempt,
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        passed: graded.passed,
        percentage: graded.percentage,
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
      
      // First, check cache
      const isAdminOrTrainer = !!(req.user && (req.user.role === 'admin' || req.user.role === 'trainer'));
      const cachedQuiz = await storage.getCachedQuiz(weekId, fileId);
      if (cachedQuiz && cachedQuiz.questions.length > 0) {
        // Teachers can only access approved quizzes; admins/trainers can always preview
        if (!isAdminOrTrainer && !cachedQuiz.approved) {
          console.log(`[FILE-QUIZ] ⏳ Quiz not yet approved for teachers`);
          res.status(404).json({ error: "No quiz available for this file" });
          return;
        }
        console.log(`[FILE-QUIZ] ✅ Found cached quiz with ${cachedQuiz.questions.length} questions`);
        res.json({ questions: cachedQuiz.questions, approved: cachedQuiz.approved });
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
      // Admins can see all batches, trainers only see their own
      const batches = req.user!.role === "admin" 
        ? await storage.getAllBatches() 
        : await storage.getAllBatches(req.user!.id);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new batch (admin only)
  app.post("/api/batches", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const batch = await storage.createBatch({
        name: req.body.name,
        description: req.body.description,
        createdBy: req.user!.id,
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      res.json({ ...batch, teachers });
    } catch (error) {
      console.error("Error fetching batch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a batch
  app.delete("/api/batches/:batchId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership - only admins can delete any batch, trainers only their own
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteBatch(req.params.batchId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: "Internal server error" });
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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

      await storage.addTeacherToBatch({
        batchId: req.params.batchId,
        teacherId: teacher.id,
      });

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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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

      if (!week.deckFiles || week.deckFiles.length === 0) {
        return res.status(400).json({ error: "No files available for quiz generation" });
      }

      // Generate quiz using the quiz service
      const { generateQuizQuestions } = await import('./quizService');

      const fileUrls = week.deckFiles.map(file => ({
        url: file.fileUrl,
        name: file.fileName,
      }));

      const questions = await generateQuizQuestions({
        fileUrls,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions,
        openEndedCount,
      });

      // Create assigned quiz
      const assignedQuiz = await storage.createAssignedQuiz({
        batchId: req.params.batchId,
        weekId,
        title,
        description,
        numQuestions,
        questions,
        assignedBy: req.user!.id,
      });

      res.status(201).json(assignedQuiz);
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { weekId, fileId, title, description, numQuestions = 5 } = req.body;
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week) {
        return res.status(404).json({ error: "Training week not found" });
      }

      if (!week.deckFiles || week.deckFiles.length === 0) {
        return res.status(400).json({ error: "No files available for quiz generation" });
      }

      // Find the specific file
      const selectedFile = week.deckFiles.find(file => file.id === fileId);
      if (!selectedFile) {
        return res.status(404).json({ error: "File not found in this training week" });
      }

      // Generate quiz using the quiz service
      const { generateQuizQuestions } = await import('./quizService');

      // Use only the selected file for quiz generation
      const fileUrls = [{
        url: selectedFile.fileUrl,
        name: selectedFile.fileName,
      }];

      const questions = await generateQuizQuestions({
        fileUrls,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions,
      });

      // Create assigned quiz with file information
      const assignedQuiz = await storage.createAssignedQuiz({
        batchId: req.params.batchId,
        weekId,
        deckFileId: fileId,
        fileName: selectedFile.fileName,
        title,
        description,
        numQuestions,
        questions,
        assignedBy: req.user!.id,
      });

      res.status(201).json(assignedQuiz);
    } catch (error: any) {
      console.error("Error assigning file quiz:", error);
      const errorMessage = error?.message || "Failed to assign file quiz";
      res.status(500).json({ error: errorMessage });
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quizzes = await storage.getAssignedQuizzesForBatch(req.params.batchId);
      res.json(quizzes);
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
      if (batch && req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
      if (batch && req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
      if (batch && req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.resetTeacherQuizAttempts(req.params.quizId, req.params.teacherId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting teacher quiz attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Edit quiz questions (trainer/admin)
  app.patch("/api/assigned-quizzes/:quizId", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { questions } = req.body;
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: "questions must be an array" });
      }
      const quiz = await storage.getAssignedQuiz(req.params.quizId);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const batch = await storage.getBatch(quiz.batchId);
      if (batch && req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.updateAssignedQuizQuestions(req.params.quizId, questions);
      res.json(updated);
    } catch (error) {
      console.error("Error updating quiz questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get pending open-ended reviews for trainer
  app.get("/api/trainer/pending-reviews", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const reviews = await storage.getPendingReviewsForTrainer(req.user!.id);
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
      res.json(quizzes);
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
      res.json(quiz);
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

      // Get all existing attempts for this quiz
      const existingAttempts = await storage.getTeacherQuizAttemptsByQuiz(
        req.teacherId!,
        req.params.quizId
      );

      // Check if teacher has already passed (>= 80%)
      const hasPassedAttempt = existingAttempts.some(
        (attempt) => (attempt.score / attempt.totalQuestions) * 100 >= 80
      );

      if (hasPassedAttempt) {
        return res.status(400).json({ error: "Quiz already passed. Retakes are not allowed after passing." });
      }

      // Check if teacher has exhausted all 3 attempts
      if (existingAttempts.length >= 3) {
        return res.status(400).json({ error: "Maximum of 3 attempts reached for this quiz." });
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
      const passed = (!hasOpenEnded && percentage >= 80) ? "yes" : (hasOpenEnded && percentage >= 80) ? "pending" : "no";
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
      if (hasOpenEnded && percentage >= 80) {
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

      res.json({
        score,
        totalQuestions,
        mcqTotal,
        passed: passed === "yes",
        openEndedPending: hasOpenEnded && percentage >= 80,
        percentage,
        attemptNumber,
        remainingAttempts: 3 - attemptNumber,
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
      if (batch && req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const batchTeachersData = await storage.getTeachersInBatch(quiz.batchId);
      const allAttempts = await Promise.all(
        batchTeachersData.map(async (t: any) => {
          const attempts = await storage.getTeacherQuizAttemptsByQuiz(t.id, req.params.quizId);
          const passed = attempts.some((a: any) => a.passed === "yes");
          const exhausted = attempts.length >= 3 && !passed;
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
      
      // Calculate quiz status
      const hasPassed = attempts.some(a => (a.score / a.totalQuestions) * 100 >= 80);
      const attemptsUsed = attempts.length;
      const canRetake = !hasPassed && attemptsUsed < 3;
      const shouldShowAnswers = hasPassed || attemptsUsed >= 3;
      
      res.json({
        attempts,
        quiz,
        hasPassed,
        attemptsUsed,
        remainingAttempts: Math.max(0, 3 - attemptsUsed),
        canRetake,
        shouldShowAnswers,
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
      
      // Enrich with quiz details
      const enrichedAttempts = await Promise.all(
        attempts.map(async (attempt) => {
          const quiz = await storage.getAssignedQuiz(attempt.assignedQuizId);
          return {
            ...attempt,
            quiz: quiz || null,
          };
        })
      );
      
      res.json(enrichedAttempts);
    } catch (error) {
      console.error("Error fetching teacher quiz attempts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get progress for all teachers in a batch (trainer view)
  app.get("/api/batches/:batchId/progress", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const batch = await storage.getBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      // Verify ownership
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const teachers = await storage.getTeachersInBatch(req.params.batchId);
      const assignedCourses = await storage.getCoursesForBatch(req.params.batchId);
      const courseNameById = Object.fromEntries(assignedCourses.map(c => [c.id, c.name]));
      const progress = await Promise.all(
        teachers.map(async (teacher) => {
          const reportCard = await storage.refreshTeacherReportCard(teacher.id);
          const completions = await db
            .select()
            .from(teacherCourseCompletion)
            .where(and(eq(teacherCourseCompletion.teacherId, teacher.id), eq(teacherCourseCompletion.batchId, req.params.batchId)));
          const courseCompletions = completions.map(c => ({
            courseId: c.courseId,
            courseName: courseNameById[c.courseId] || "Course",
            status: c.status,
            completedModules: c.completedWeeks,
            totalModules: c.totalWeeks,
            percentage: c.totalWeeks > 0
              ? Math.round((c.completedWeeks / c.totalWeeks) * 100)
              : (c.status === "completed" ? 100 : 0),
          }));
          const completedCount = courseCompletions.filter(c => c.status === "completed").length;
          const overallPercentage = assignedCourses.length > 0
            ? Math.round((completedCount / assignedCourses.length) * 100)
            : 0;
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
            courseCompletions,
            completedCount,
            inProgressCount: courseCompletions.filter(c => c.status !== "completed").length,
            notStartedCount: Math.max(0, assignedCourses.length - courseCompletions.length),
            overallPercentage,
          };
        })
      );
      res.json(progress);
    } catch (error) {
      console.error("Error fetching batch progress:", error);
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
      if (req.user!.role !== "admin" && batch.createdBy !== req.user!.id) {
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
  
  // Get teacher's assigned weeks (from their batches and batch courses)
  app.get("/api/teacher/assigned-weeks", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      
      // Get (course, batch) pairs so each week knows its batchId
      const courseBatchPairs = await db
        .select({ course: courses, batchId: batchTeachers.batchId })
        .from(batchTeachers)
        .innerJoin(batchCourses, eq(batchTeachers.batchId, batchCourses.batchId))
        .innerJoin(courses, eq(batchCourses.courseId, courses.id))
        .where(eq(batchTeachers.teacherId, teacherId))
        .orderBy(asc(batchCourses.assignedAt));
      
      if (courseBatchPairs.length === 0) {
        return res.json([]);
      }
      
      // For each (course, batch) pair, get its weeks — track by weekId to avoid duplicates
      const allWeeks: any[] = [];
      const seenWeekIds = new Set<string>();
      
      for (const { course, batchId } of courseBatchPairs) {
        const courseWeeks = await storage.getWeeksForCourse(course.id);
        
        for (const week of courseWeeks) {
          if (seenWeekIds.has(week.id)) {
            continue;
          }
          seenWeekIds.add(week.id);
          
          const progressRecords = await storage.getAllTeacherContentProgressForWeek(teacherId, week.id);
          const totalFiles = week.deckFiles?.length || 0;
          let completedFiles = progressRecords.filter(p => p.status === "completed").length;
          if (totalFiles > 0 && completedFiles < totalFiles) {
            const passedFlags = await Promise.all(
              (week.deckFiles || []).map(f => storage.hasPassedFileQuiz(week.id, f.id, teacherId))
            );
            completedFiles = Math.max(completedFiles, passedFlags.filter(Boolean).length);
          }
          const percentage = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 100;
          
          allWeeks.push({
            ...week,
            batchId,
            courseId: course.id,
            courseName: course.name,
            progress: {
              total: totalFiles,
              completed: completedFiles,
              percentage,
            },
          });
        }
      }
      
      const byBatch = new Map<string, any[]>();
      for (const week of allWeeks) {
        const key = week.batchId || "none";
        const list = byBatch.get(key) || [];
        list.push(week);
        byBatch.set(key, list);
      }
      res.json([...byBatch.values()].flatMap(list => applyModuleLocks(list)));
    } catch (error) {
      console.error("Error fetching assigned weeks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get all content files for a week with progress and unlock status
  app.get("/api/teachers/weeks/:weekId/content", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId } = req.params;
      const teacherId = req.teacherId!;
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles) {
        return res.status(404).json({ error: "Week not found" });
      }

      if (week.courseId) {
        const courseWeeks = await storage.getWeeksForCourse(week.courseId);
        const ordered = [...courseWeeks].sort((a, b) => a.weekNumber - b.weekNumber);
        const currentIndex = ordered.findIndex(w => w.id === weekId);
        if (currentIndex > 0) {
          const previous = ordered[currentIndex - 1];
          const prevFiles = previous.deckFiles || [];
          const prevProgress = await storage.getAllTeacherContentProgressForWeek(teacherId, previous.id);
          const completedCount = prevFiles.filter(f =>
            prevProgress.some(p => p.deckFileId === f.id && p.status === "completed")
          ).length;
          const passedCount = (await Promise.all(
            prevFiles.map(f => storage.hasPassedFileQuiz(previous.id, f.id, teacherId))
          )).filter(Boolean).length;
          const previousComplete = moduleIsComplete({
            total: prevFiles.length,
            completed: Math.max(completedCount, passedCount),
            percentage: prevFiles.length > 0
              ? Math.round((Math.max(completedCount, passedCount) / prevFiles.length) * 100)
              : 100,
          });
          if (!previousComplete) {
            return res.status(403).json({
              error: "Complete the previous module and its quiz before opening this one.",
              locked: true,
              previousWeekId: previous.id,
              previousWeekNumber: previous.weekNumber,
            });
          }
        }
      }
      
      // Get all progress records for this teacher and week
      const progressRecords = await storage.getAllTeacherContentProgressForWeek(teacherId, weekId);
      const passedByFile = new Set<string>();
      for (const file of week.deckFiles!) {
        if (await storage.hasPassedFileQuiz(weekId, file.id, teacherId)) {
          passedByFile.add(file.id);
        }
      }
      
      // Map deck files with their progress and unlock status
      const contentWithProgress = week.deckFiles!.map((file, index) => {
        const progress = progressRecords.find(p => p.deckFileId === file.id);
        const quizPassed = passedByFile.has(file.id);
        const isFirst = index === 0;
        
        let status: string;
        if (quizPassed) {
          status = "completed";
        } else if (isFirst) {
          status = progress?.status || "available";
        } else {
          const previousFile = week.deckFiles![index - 1];
          const previousProgress = progressRecords.find(p => p.deckFileId === previousFile.id);
          const isPreviousCompleted = previousProgress?.status === "completed" || passedByFile.has(previousFile.id);
          status = isPreviousCompleted ? (progress?.status || "available") : "locked";
        }
        
        return {
          ...file,
          status,
          progress: quizPassed
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
  
  // Mark content as viewed
  app.post("/api/teachers/weeks/:weekId/content/:deckFileId/viewed", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId, deckFileId } = req.params;
      const teacherId = req.teacherId!;
      
      const progress = await storage.upsertTeacherContentProgress({
        teacherId,
        weekId,
        deckFileId,
        status: "viewed",
        viewedAt: new Date(),
      });
      
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
        // Check quiz_cache — does a quiz exist for this file?
        const cached = await storage.getCachedQuiz(weekId, file.id);
        const quizExists = !!(cached && cached.questions.length > 0);
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

  // Generate quiz for content file
  app.post("/api/teachers/weeks/:weekId/content/:deckFileId/generate-quiz", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId, deckFileId } = req.params;
      const teacherId = req.teacherId!;
      const { numQuestions = 5 } = req.body;
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles) {
        return res.status(404).json({ error: "Week not found" });
      }
      
      const file = week.deckFiles.find(f => f.id === deckFileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Generate unique quiz generation ID
      const quizGenerationId = `quiz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Import quiz service
      const { generateSingleFileQuiz } = await import('./quizService');
      
      const questions = await generateSingleFileQuiz({
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions,
      });
      
      // Update progress to quiz_required
      await storage.upsertTeacherContentProgress({
        teacherId,
        weekId,
        deckFileId,
        status: "quiz_required",
      });
      
      res.json({ 
        questions,
        quizGenerationId,
      });
    } catch (error) {
      console.error("Error generating quiz:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate quiz" });
    }
  });
  
  // Submit quiz for content file
  app.post("/api/teachers/weeks/:weekId/content/:deckFileId/submit-quiz", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId, deckFileId } = req.params;
      const teacherId = req.teacherId!;
      const { questions, answers, quizGenerationId } = req.body;
      
      if (!questions || !Array.isArray(questions) || !answers || typeof answers !== 'object' || !quizGenerationId) {
        return res.status(400).json({ error: "Invalid quiz submission" });
      }
      
      const { scoreQuizSubmission } = await import("./quizService");
      const graded = scoreQuizSubmission(questions, answers);

      // Save attempt
      const attempt = await storage.saveTeacherContentQuizAttempt({
        teacherId,
        weekId,
        deckFileId,
        quizGenerationId,
        attemptNumber: 1, // Will be auto-calculated by storage method
        questions,
        answers,
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        passed: graded.passed ? "yes" : "no",
      });
      
      // If passed, unlock next content and mark this as completed
      let generatedCertificate = null;
      if (graded.passed) {
        await storage.upsertTeacherContentProgress({
          teacherId,
          weekId,
          deckFileId,
          status: "completed",
          completedAt: new Date(),
        });
        
        // Unlock next content file
        const week = await storage.getTrainingWeek(weekId);
        if (week && week.deckFiles) {
          const currentIndex = week.deckFiles.findIndex(f => f.id === deckFileId);
          if (currentIndex >= 0 && currentIndex < week.deckFiles.length - 1) {
            const nextFile = week.deckFiles[currentIndex + 1];
            await storage.upsertTeacherContentProgress({
              teacherId,
              weekId,
              deckFileId: nextFile.id,
              status: "available",
            });
          }
        }
        
        // Try to auto-generate certificate if teacher has >= 90% course completion
        if (week && week.courseId) {
          try {
            generatedCertificate = await storage.tryAutoGenerateCertificate(teacherId, week.courseId);
            if (generatedCertificate) {
              console.log(`Auto-generated certificate for teacher ${teacherId} in course ${week.courseId}`);
            }
          } catch (certError) {
            console.error("Error auto-generating certificate:", certError);
          }
        }
      }
      
      // Get current attempt count for this quiz generation
      const attempts = await storage.getTeacherContentQuizAttempts(teacherId, weekId, deckFileId, quizGenerationId);
      const canRegenerate = attempts.length >= 3 && !graded.passed;

      if (teacherId) {
        await storage.refreshTeacherReportCard(teacherId);
      }
      if (graded.passed) {
        const completedWeek = await storage.getTrainingWeek(weekId);
        if (completedWeek?.courseId) {
          await storage.syncTeacherCourseCompletion(teacherId, completedWeek.courseId);
        }
      }
      
      res.json({
        score: graded.score,
        totalQuestions: graded.totalQuestions,
        passed: graded.passed,
        percentage: graded.percentage,
        attemptNumber: attempt.attemptNumber,
        attemptsUsed: attempts.length,
        remainingAttempts: Math.max(0, 3 - attempts.length),
        canRegenerate,
        certificateGenerated: !!generatedCertificate,
        certificate: generatedCertificate,
      });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      if (error instanceof Error && error.message.includes('Maximum 3 attempts')) {
        return res.status(400).json({ error: "Maximum 3 attempts per quiz exceeded. Please request a new quiz." });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Regenerate quiz after 3 failed attempts
  app.post("/api/teachers/weeks/:weekId/content/:deckFileId/regenerate-quiz", isTeacherAuthenticated, async (req, res) => {
    try {
      const { weekId, deckFileId } = req.params;
      const teacherId = req.teacherId!;
      const { previousQuizGenerationId, numQuestions = 5 } = req.body;
      
      if (!previousQuizGenerationId) {
        return res.status(400).json({ error: "previousQuizGenerationId is required" });
      }
      
      // Verify they've used all 3 attempts on the previous quiz
      const previousAttempts = await storage.getTeacherContentQuizAttempts(teacherId, weekId, deckFileId, previousQuizGenerationId);
      if (previousAttempts.length !== 3) {
        return res.status(400).json({ error: "Must use exactly 3 attempts before requesting a new quiz" });
      }
      
      // Check if any of the previous attempts passed
      const hasPassed = previousAttempts.some(a => a.passed === "yes");
      if (hasPassed) {
        return res.status(400).json({ error: "You have already passed this quiz" });
      }
      
      // Verify all 3 attempts failed (defensive check)
      const failedAttempts = previousAttempts.filter(a => a.passed === "no");
      if (failedAttempts.length !== 3) {
        return res.status(400).json({ error: "Cannot regenerate quiz unless all 3 attempts have failed" });
      }
      
      const week = await storage.getTrainingWeek(weekId);
      if (!week || !week.deckFiles) {
        return res.status(404).json({ error: "Week not found" });
      }
      
      const file = week.deckFiles.find(f => f.id === deckFileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Generate new quiz generation ID
      const newQuizGenerationId = `quiz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Save regeneration record
      await storage.saveTeacherQuizRegeneration({
        teacherId,
        weekId,
        deckFileId,
        previousQuizGenerationId,
        newQuizGenerationId,
      });
      
      // Generate new quiz
      const { generateSingleFileQuiz } = await import('./quizService');
      
      const questions = await generateSingleFileQuiz({
        fileUrl: file.fileUrl,
        fileName: file.fileName,
        competencyFocus: week.competencyFocus,
        objective: week.objective,
        numQuestions,
      });
      
      res.json({ 
        questions,
        quizGenerationId: newQuizGenerationId,
      });
    } catch (error) {
      console.error("Error regenerating quiz:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to regenerate quiz" });
    }
  });
  
  // Trainer endpoint: Get teacher's content viewing history for a week
  app.get("/api/trainers/teachers/:teacherId/weeks/:weekId/content-history", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { teacherId, weekId } = req.params;
      
      // Get all progress records
      const progressRecords = await storage.getAllTeacherContentProgressForWeek(teacherId, weekId);
      
      // Get all quiz attempts
      const allAttempts = await storage.getAllTeacherContentQuizAttemptsForFile(teacherId, weekId, ""); // Get all files
      
      // Get all regenerations
      const regenerations = await storage.getAllTeacherQuizRegenerationsForWeek(teacherId, weekId);
      
      // Get week details
      const week = await storage.getTrainingWeek(weekId);
      
      // Organize data by deck file
      const history = progressRecords.map(progress => {
        const file = week?.deckFiles?.find(f => f.id === progress.deckFileId);
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
      const allCourses = await storage.getAllCourses();

      res.json({
        totalTrainers: approvedTrainers.length,
        totalTeachers: approvedTeachers.length,
        totalCourses: allCourses.length,
        activeUsers: approvedTrainers.length + approvedTeachers.length,
      });
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all trainers with progress
  app.get("/api/admin/trainers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const allTrainers = await db.select().from(users).where(eq(users.role, "trainer")).orderBy(users.createdAt);
      
      // Sanitize and add progress data
      const trainersData = allTrainers.map((trainer: any) => ({
        id: trainer.id,
        username: trainer.username,
        email: trainer.email,
        role: trainer.role,
        approvalStatus: trainer.approvalStatus,
        createdAt: trainer.createdAt,
        lastLogin: trainer.lastLogin,
        progress: Math.floor(Math.random() * 100), // Mock progress for now
        filesCompleted: Math.floor(Math.random() * 20),
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

      const { password, ...sanitized } = trainer;
      res.json({
        ...sanitized,
        progress: Math.floor(Math.random() * 100),
        filesCompleted: Math.floor(Math.random() * 20),
        completedLessons: ["Week 1 Overview", "Module 2: Basics"],
        activityTimeline: [
          {
            action: "login",
            timestamp: new Date().toISOString(),
            details: "Logged in to system",
          },
          {
            action: "view",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            details: "Viewed training materials",
          },
        ],
      });
    } catch (error) {
      console.error("Error getting trainer details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all teachers with progress
  app.get("/api/admin/teachers", isAuthenticated, isStrictAdmin, async (req, res) => {
    try {
      const allTeachers = await db.select().from(teachers);
      
      // Sanitize and add progress data
      const teachersData = (allTeachers as any).map((teacher: any) => ({
        id: teacher.id,
        teacherId: teacher.teacherId,
        name: teacher.name,
        email: teacher.email,
        role: "teacher",
        approvalStatus: teacher.approvalStatus,
        createdAt: teacher.createdAt,
        lastLogin: teacher.lastLogin,
        progress: Math.floor(Math.random() * 100),
        filesViewed: Math.floor(Math.random() * 50),
        courseCompletion: Math.floor(Math.random() * 100),
      }));
      
      res.json(teachersData);
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
      res.json({
        ...sanitized,
        progress: Math.floor(Math.random() * 100),
        filesViewed: Math.floor(Math.random() * 50),
        courseCompletion: Math.floor(Math.random() * 100),
        completedLessons: ["Week 1 Content", "Quiz 1 Passed"],
        activityTimeline: [
          {
            action: "login",
            timestamp: new Date().toISOString(),
            details: "Logged in to system",
          },
          {
            action: "complete",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            details: "Completed Week 1 content",
          },
        ],
      });
    } catch (error) {
      console.error("Error getting teacher details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== COURSE MANAGEMENT (ADMIN ONLY) ====================
  // Get all courses
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await storage.getAllCourses();
      res.json(courses);
    } catch (error) {
      console.error("Error getting courses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get course with weeks
  app.get("/api/courses/:id", async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      const weeks = await storage.getWeeksForCourse(course.id);
      res.json({ ...course, weeks });
    } catch (error) {
      console.error("Error getting course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get weeks for a course
  app.get("/api/courses/:courseId/weeks", async (req, res) => {
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
      
      // Filter by user permissions (admin sees all, trainer only sees their own)
      let results = batchesWithCourse.map(r => r.batch);
      if (req.user!.role !== "admin") {
        results = results.filter(b => b.createdBy === req.user!.id);
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error getting batches for course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create course (admin only)
  app.post("/api/courses", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { name, description, orderIndex } = req.body;
      const course = await storage.createCourse({ name, description, orderIndex: orderIndex || 0 });
      res.json(course);
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update course (admin only)
  app.patch("/api/courses/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const course = await storage.updateCourse(req.params.id, req.body);
      if (!course) return res.status(404).json({ error: "Course not found" });
      res.json(course);
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete course (admin only)
  app.delete("/api/courses/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const success = await storage.deleteCourse(req.params.id);
      if (!success) return res.status(404).json({ error: "Course not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Assign course to batch (trainer)
  app.post("/api/courses/:courseId/assign", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { targetId, targetType } = req.body;
      const { courseId } = req.params;

      if (!targetId || targetType !== "batch") {
        return res.status(400).json({ error: "Invalid request: targetId and targetType='batch' required" });
      }

      const batch = await storage.getBatch(targetId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      const assignment = await storage.assignCourseToBatch({
        batchId: targetId,
        courseId,
        assignedBy: req.user!.id,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning course:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reorder weeks for a course (admin only)
  app.post("/api/courses/:courseId/weeks/reorder", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { weekId, newPosition } = req.body;
      const { courseId } = req.params;
      
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
  app.get("/api/batches/:batchId/courses", async (req, res) => {
    try {
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
  app.get("/api/teacher/:teacherId/courses", async (req, res) => {
    try {
      const courses = await storage.getCoursesForTeacher(req.params.teacherId);
      res.json(courses);
    } catch (error) {
      console.error("Error getting teacher courses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== CERTIFICATE MANAGEMENT ====================
  // Get certificate template for batch
  app.get("/api/batches/:batchId/certificate-template", isAuthenticated, isTrainer, async (req, res) => {
    try {
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
      const template = await storage.approveBatchCertificateTemplate(req.params.batchId, req.user!.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error) {
      console.error("Error approving certificate template:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Generate certificates for completed teachers in batch-course (admin only)
  app.post("/api/batches/:batchId/courses/:courseId/generate-certificates", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const completedTeachers = await storage.getCompletedTeachersForBatchCourse(req.params.batchId, req.params.courseId);
      const template = await storage.getBatchCertificateTemplate(req.params.batchId);
      const course = await storage.getCourse(req.params.courseId);

      if (!template || !course) {
        return res.status(404).json({ error: "Certificate template or course not found" });
      }

      const generatedCerts = await Promise.all(
        completedTeachers.map(teacher =>
          storage.generateTeacherCertificate({
            teacherId: teacher.id,
            batchId: req.params.batchId,
            courseId: req.params.courseId,
            templateId: template.id,
            teacherName: teacher.name,
            courseName: course.name,
            appreciationText: template.appreciationText,
            adminName1: template.adminName1 || undefined,
            adminName2: template.adminName2 || undefined,
          })
        )
      );

      res.json({ count: generatedCerts.length, certificates: generatedCerts });
    } catch (error) {
      console.error("Error generating certificates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get teacher certificate
  app.get("/api/teacher/:teacherId/certificates/:batchId/:courseId", async (req, res) => {
    try {
      const cert = await storage.getTeacherCertificate(req.params.teacherId, req.params.batchId, req.params.courseId);
      res.json(cert || null);
    } catch (error) {
      console.error("Error getting certificate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all certificates for teacher
  app.get("/api/teacher/:teacherId/certificates", async (req, res) => {
    try {
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
      const certs = await storage.getCertificatesForBatch(req.params.batchId);
      res.json(certs);
    } catch (error) {
      console.error("Error getting batch certificates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get certificate by ID (admin/trainer can view any, teacher can view their own)
  app.get("/api/certificates/:certId", isAuthenticated, async (req, res) => {
    try {
      const cert = await storage.getTeacherCertificateById(req.params.certId);
      if (!cert) {
        return res.status(404).json({ error: "Certificate not found" });
      }
      
      // Check access: admin/trainer can see any, teacher can only see their own
      const user = req.user as Express.User;
      if (user.role === "teacher" && cert.teacherId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(cert);
    } catch (error) {
      console.error("Error getting certificate:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update certificate (admin/trainer only)
  app.patch("/api/certificates/:certId", isAuthenticated, isTrainer, async (req, res) => {
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
  app.get("/api/trainer/analytics", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const analytics = await storage.getTrainerAnalytics(req.user!.id);
      res.json(analytics);
    } catch (error) {
      console.error("Error getting trainer analytics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Trainer teacher analytics
  app.get("/api/trainer/analytics/teachers", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const analytics = await storage.getTeacherAnalyticsForTrainer(req.user!.id);
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
          const batches = await storage.getAllBatches(trainer.id);
          return {
            id: trainer.id,
            email: trainer.email,
            role: trainer.role,
            approvalStatus: trainer.approvalStatus,
            batchCount: batches.length,
          };
        })
      );

      // Enrich teachers with course count
      const enrichedTeachers = await Promise.all(
        allTeachers.map(async (teacher) => {
          const batches = await storage.getBatchesForTeacher(teacher.id);
          const courseCount = batches.length;
          return {
            id: teacher.id,
            email: teacher.email,
            role: "teacher",
            approvalStatus: teacher.approvalStatus,
            courseCount,
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
  app.post("/api/satisfaction-scores", async (req, res) => {
    try {
      const { type, raterId, raterRole, targetId, targetType, batchId, weekId, score, comment } = req.body;
      if (!type || !raterId || !raterRole || !targetId || !targetType || !score) {
        return res.status(400).json({ error: "type, raterId, raterRole, targetId, targetType, and score are required" });
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
      const attendanceDate = new Date(date);
      const results = [];
      for (const record of records) {
        if (!record.teacherId || !record.status) continue;
        try {
          const result = await storage.createAttendanceRecord({
            teacherId: record.teacherId,
            batchId,
            date: attendanceDate,
            status: record.status,
            markedBy: markerId,
            notes: record.notes || null,
          });
          results.push(result);
        } catch (err: any) {
          if (err.code === '23505') {
            // Duplicate - update instead
            results.push({ teacherId: record.teacherId, status: 'duplicate_skipped' });
          } else {
            throw err;
          }
        }
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

  // ══════════════════════════════════════════════════════════════
  // Scheduled Event Endpoints
  // ══════════════════════════════════════════════════════════════

  // Create event (trainer/admin)
  app.post("/api/batches/:batchId/events", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const { batchId } = req.params;
      const { title, description, eventType, startDate, endDate } = req.body;
      if (!title || !eventType || !startDate) {
        return res.status(400).json({ error: "title, eventType, and startDate are required" });
      }
      const event = await storage.createScheduledEvent({
        title,
        description: description || null,
        eventType,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        batchId,
        createdBy: (req.user as any)?.id,
      });
      res.json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get batch events (trainer/admin)
  app.get("/api/batches/:batchId/events", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const events = await storage.getScheduledEvents(req.params.batchId);
      res.json(events);
    } catch (error) {
      console.error("Error getting events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete event (trainer/admin)
  app.delete("/api/events/:id", isAuthenticated, isTrainer, async (req, res) => {
    try {
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

  const httpServer = createServer(app);
  return httpServer;
}
