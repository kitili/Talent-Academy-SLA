// Teacher Authentication (separate from Trainer/Admin users)
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { hashPassword } from "./auth";
import { Teacher as SelectTeacher } from "@shared/schema";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Extend Express Request type to include teacherId
declare global {
  namespace Express {
    interface Request {
      teacherId?: string;
    }
  }
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupTeacherAuth(app: Express) {
  // Teacher registration (public)
  app.post("/api/teacher/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;
      
      // Check if teacher with this email already exists
      const existingTeacher = await storage.getTeacherByEmail(email);
      if (existingTeacher) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Create teacher with auto-incrementing teacherId and pending approval status
      const teacher = await storage.createTeacher({
        name,
        email,
        password: await hashPassword(password),
        approvalStatus: "pending",
      });

      // Create initial report card
      await storage.upsertTeacherReportCard({
        teacherId: teacher.id,
        level: "Beginner",
        totalQuizzesTaken: 0,
        totalQuizzesPassed: 0,
        averageScore: 0,
      });

      // Don't auto-login - user needs approval first from admin or trainer
      const { password: _, ...teacherWithoutPassword } = teacher;
      res.status(201).json({
        ...teacherWithoutPassword,
        message: "Account created successfully. Your account is pending approval from admin or trainer."
      });
    } catch (error: any) {
      console.error("Teacher registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  // Teacher login
  // UPDATED: Accept either teacherId (numeric ID) or email for login
  app.post("/api/teacher/login", async (req, res) => {
    try {
      const { identifier, password } = req.body;
      
      if (!identifier || !password) {
        return res.status(400).json({ message: "Identifier and password are required" });
      }
      
      // Determine if identifier is a Teacher ID (numeric) or email (contains @)
      let teacher;
      if (/^\d+$/.test(identifier.trim())) {
        // It's a numeric Teacher ID
        teacher = await storage.getTeacherByTeacherId(parseInt(identifier.trim()));
      } else if (identifier.includes('@')) {
        // It's an email address
        teacher = await storage.getTeacherByEmail(identifier.trim());
      } else {
        return res.status(401).json({ message: "Invalid Teacher ID or email format" });
      }
      
      if (!teacher) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const passwordMatch = await comparePasswords(password, teacher.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if account is approved
      if (teacher.approvalStatus === "pending") {
        return res.status(403).json({ 
          message: "Your account is pending approval. Please wait for admin or trainer approval.",
          approvalStatus: "pending"
        });
      }
      
      if (teacher.approvalStatus === "rejected") {
        return res.status(403).json({ 
          message: "Your account has been rejected. Please contact support.",
          approvalStatus: "rejected"
        });
      }

      // Store teacher session
      (req.session as any).teacherId = teacher.id;

      // Don't send password back to client
      const { password: _, ...teacherWithoutPassword } = teacher;
      res.status(200).json(teacherWithoutPassword);
    } catch (error: any) {
      console.error("Teacher login error:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  // Teacher logout
  app.post("/api/teacher/logout", (req, res) => {
    (req.session as any).teacherId = undefined;
    res.sendStatus(200);
  });

  // Get current teacher
  app.get("/api/teacher/me", async (req, res) => {
    const teacherId = (req.session as any).teacherId;
    if (!teacherId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const teacher = await storage.getTeacher(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Don't send password back to client
    const { password, ...teacherWithoutPassword } = teacher;
    res.json(teacherWithoutPassword);
  });
}

// Middleware to check if teacher is authenticated
export function isTeacherAuthenticated(req: Request, res: Response, next: NextFunction) {
  const teacherId = (req.session as any).teacherId;
  if (!teacherId) {
    return res.status(401).json({ message: "Unauthorized: Teacher authentication required" });
  }
  req.teacherId = teacherId;
  next();
}
