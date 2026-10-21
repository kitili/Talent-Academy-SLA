// Teacher Authentication (separate from Trainer/Admin users)
import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { loginRateLimit } from "./security";
import { hasDatabaseUrl } from "./db";
import { endSession } from "./auth";
import { findApprovedAccount } from "./auth";
import { matchTestLogin, TEACHER_PASSWORD } from "./testLogins";

// Extend Express Request type to include teacherId
declare global {
  namespace Express {
    interface Request {
      teacherId?: string;
    }
  }
}

export function setupTeacherAuth(app: Express) {
  app.post("/api/teacher/register", async (_req, res) => {
    res.status(403).json({ message: "This academy only accepts the test logins." });
  });

  app.post("/api/teacher/login", loginRateLimit, async (req, res) => {
    try {
      const identifier = String(req.body.identifier || "").trim();
      const password = String(req.body.password || "").trim();

      if (!identifier || !password) {
        return res.status(400).json({ message: "Identifier and password are required" });
      }

      let testLogin = matchTestLogin(identifier, password, "teacher");
      if (!testLogin && hasDatabaseUrl()) {
        const account = await findApprovedAccount(identifier, password, "teacher");
        if (account?.teacher) {
          (req.session as any).teacherId = account.teacher.id;
          await new Promise<void>((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
          });
          const { password: _, ...teacherWithoutPassword } = account.teacher;
          res.status(200).json(teacherWithoutPassword);
          return;
        }
      }
      if (!testLogin && hasDatabaseUrl() && /^\d+$/.test(identifier) && password === TEACHER_PASSWORD) {
        const byId = await storage.getTeacherByTeacherId(parseInt(identifier, 10));
        if (byId) testLogin = matchTestLogin(byId.email, TEACHER_PASSWORD, "teacher");
      }
      if (!testLogin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          message: "Sign-in is unavailable because the live site has no database URL. Add NEON_DATABASE_URL or DATABASE_URL in Vercel, then redeploy.",
        });
      }

      const { ensureTestLogin } = await import("./ensureTestLogins");
      const ready = await ensureTestLogin(testLogin);
      if (!ready.teacher) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      (req.session as any).teacherId = ready.teacher.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      const { password: _, ...teacherWithoutPassword } = ready.teacher;
      res.status(200).json(teacherWithoutPassword);
    } catch (error: any) {
      console.error("Teacher login error:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  app.post("/api/teacher/logout", (req, res) => {
    endSession(req, res);
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
