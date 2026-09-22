// Username/Password Authentication - based on blueprint:javascript_auth_all_persistance
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { hasDatabaseUrl } from "./db";
import { User as SelectUser, Teacher as SelectTeacher } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Extend session type to include pending multi-role verification
declare module 'express-session' {
  interface SessionData {
    pendingRoleVerification?: {
      verifiedAt: number;
      roles: Array<{
        id: string;
        role: 'admin' | 'trainer' | 'teacher';
        name: string;
        email: string;
      }>;
    };
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  try {
    if (!supplied || !stored || !stored.includes(".")) return false;
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt || hashed.length % 2 !== 0) return false;
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    if (hashedBuf.length !== suppliedBuf.length) return false;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch {
    return false;
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "local-dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('[AUTH] Login attempt for username:', username);
        // UPDATED: Try both username and email for login
        let user = await storage.getUserByUsername(username);
        if (!user) {
          user = await storage.getUserByEmail(username);
        }
        console.log('[AUTH] User found:', !!user);
        
        if (!user) {
          console.log('[AUTH] User not found');
          return done(null, false);
        }
        
        const passwordMatch = await comparePasswords(password, user.password);
        console.log('[AUTH] Password match:', passwordMatch);
        
        if (!passwordMatch) {
          console.log('[AUTH] Password mismatch');
          return done(null, false);
        }
        
        console.log('[AUTH] Login successful for user:', user.username);
        return done(null, user);
      } catch (error) {
        console.error('[AUTH] Error during authentication:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  // Register new trainer account (public registration for trainers)
  app.post("/api/register", async (req, res, next) => {
    try {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          message: "Registration is unavailable because the live site has no DATABASE_URL. Add a Neon Postgres URL in Vercel, then redeploy.",
        });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Public registration only allows trainer accounts - admins must be created by existing admins
      const user = await storage.createUser({
        ...req.body,
        role: "trainer", // Force trainer role for public registration
        password: await hashPassword(req.body.password),
        approvalStatus: "pending",
      });

      const { password, ...userWithoutPassword } = user;
      res.status(201).json({
        ...userWithoutPassword,
        message: "Trainer account created. Your account is pending admin approval."
      });
    } catch (error: any) {
      console.error('[AUTH] Registration error:', error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  // Multi-role aware login endpoint
  app.post("/api/login", async (req, res, next) => {
    try {
      const username = String(req.body.username || "").trim();
      const password = String(req.body.password || "").trim();
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username/email and password are required" });
      }

      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          message: "Sign-in is unavailable because the live site has no DATABASE_URL. Add a Neon Postgres URL in Vercel, then redeploy.",
        });
      }

      // Collect all matching accounts across both tables
      const matchingRoles: Array<{
        id: string;
        role: 'admin' | 'trainer' | 'teacher';
        name: string;
        email: string;
        user?: SelectUser;
        teacher?: SelectTeacher;
      }> = [];

      // Check users table (admin/trainer) - by username or email
      let usersToCheck: SelectUser[] = [];
      const userByUsername = await storage.getUserByUsername(username);
      if (userByUsername) {
        usersToCheck.push(userByUsername);
      }
      
      // Also get all users by email (for multi-role support)
      const usersByEmail = await storage.getAllUsersByEmail(username);
      for (const u of usersByEmail) {
        if (!usersToCheck.find(existing => existing.id === u.id)) {
          usersToCheck.push(u);
        }
      }

      // Check each user's password
      for (const user of usersToCheck) {
        try {
          const passwordMatch = await comparePasswords(password, user.password);
          if (passwordMatch && user.approvalStatus === "approved") {
            matchingRoles.push({
              id: user.id,
              role: user.role as 'admin' | 'trainer',
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
              email: user.email || user.username,
              user
            });
          }
        } catch (e) {
          // Password comparison failed, skip this user
        }
      }

      // Check teachers table - by email, numeric teacher ID, or exact name
      let teachersToCheck = await storage.getAllTeachersByEmail(username);
      if (/^\d+$/.test(username)) {
        const byId = await storage.getTeacherByTeacherId(parseInt(username, 10));
        if (byId && !teachersToCheck.find((existing) => existing.id === byId.id)) {
          teachersToCheck.push(byId);
        }
      }
      const teachersByEmail = teachersToCheck;
      for (const teacher of teachersByEmail) {
        try {
          const passwordMatch = await comparePasswords(password, teacher.password);
          if (passwordMatch && teacher.approvalStatus === "approved") {
            matchingRoles.push({
              id: teacher.id,
              role: 'teacher',
              name: teacher.name,
              email: teacher.email,
              teacher
            });
          }
        } catch (e) {
          // Password comparison failed, skip this teacher
        }
      }

      // No matching accounts found
      if (matchingRoles.length === 0) {
        // Check if any accounts exist but are pending/rejected
        const pendingUser = usersToCheck.find(u => u.approvalStatus === "pending");
        const pendingTeacher = teachersByEmail.find(t => t.approvalStatus === "pending");
        
        if (pendingUser) {
          return res.status(403).json({ 
            message: "Your account is pending approval. Please wait for admin approval.",
            approvalStatus: "pending"
          });
        }
        if (pendingTeacher) {
          return res.status(403).json({ 
            message: "Your account is pending approval. Please wait for admin or trainer approval.",
            approvalStatus: "pending"
          });
        }
        
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Single role - log in directly
      if (matchingRoles.length === 1) {
        const match = matchingRoles[0];
        
        if (match.user) {
          // Admin/Trainer login
          req.login(match.user, (err) => {
            if (err) return next(err);
            const { password: _, ...userWithoutPassword } = match.user!;
            res.status(200).json(userWithoutPassword);
          });
        } else if (match.teacher) {
          // Teacher login - store in session
          (req.session as any).teacherId = match.teacher.id;
          await new Promise<void>((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
          });
          const { password: _, ...teacherWithoutPassword } = match.teacher;
          res.status(200).json({ ...teacherWithoutPassword, role: 'teacher' });
        }
        return;
      }

      // Multiple roles found - return options for user to choose
      req.session.pendingRoleVerification = {
        verifiedAt: Date.now(),
        roles: matchingRoles.map(r => ({
          id: r.id,
          role: r.role,
          name: r.name,
          email: r.email
        }))
      };
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.status(200).json({
        multiRole: true,
        message: "Multiple roles found for this email. Please select which role to use.",
        roles: matchingRoles.map(r => ({
          id: r.id,
          role: r.role,
          name: r.name
        }))
      });

    } catch (error: any) {
      console.error('[AUTH] Multi-role login error:', error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  // Role selection endpoint - finalizes login after multi-role verification
  app.post("/api/login/select", async (req, res, next) => {
    try {
      const { roleId, role } = req.body;
      
      if (!roleId || !role) {
        return res.status(400).json({ message: "Role selection is required" });
      }

      // Verify pending role verification exists and is recent (within 5 minutes)
      const pending = req.session.pendingRoleVerification;
      if (!pending) {
        return res.status(401).json({ message: "No pending role verification. Please log in again." });
      }
      
      const fiveMinutes = 5 * 60 * 1000;
      if (Date.now() - pending.verifiedAt > fiveMinutes) {
        delete req.session.pendingRoleVerification;
        return res.status(401).json({ message: "Role verification expired. Please log in again." });
      }

      // Verify the selected role was part of the verified options
      const selectedRole = pending.roles.find(r => r.id === roleId && r.role === role);
      if (!selectedRole) {
        // Clear pending verification on invalid selection for security
        delete req.session.pendingRoleVerification;
        return res.status(403).json({ message: "Invalid role selection" });
      }

      // Clear pending verification
      delete req.session.pendingRoleVerification;

      if (role === 'teacher') {
        // Teacher login
        const teacher = await storage.getTeacher(roleId);
        if (!teacher) {
          return res.status(404).json({ message: "Teacher not found" });
        }
        
        (req.session as any).teacherId = teacher.id;
        const { password: _, ...teacherWithoutPassword } = teacher;
        
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        res.status(200).json({ ...teacherWithoutPassword, role: 'teacher' });
      } else {
        // Admin/Trainer login
        const user = await storage.getUser(roleId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        
        req.login(user, (err) => {
          if (err) return next(err);
          const { password: _, ...userWithoutPassword } = user;
          res.status(200).json(userWithoutPassword);
        });
      }

    } catch (error: any) {
      console.error('[AUTH] Role selection error:', error);
      res.status(500).json({ message: error.message || "Role selection failed" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    if ((req.session as any).teacherId) {
      delete (req.session as any).teacherId;
    }

    const finish = () => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid", { path: "/", httpOnly: true, sameSite: "lax" });
        res.sendStatus(200);
      });
    };

    if (typeof req.logout === "function") {
      req.logout((err) => {
        if (err) return next(err);
        finish();
      });
    } else {
      finish();
    }
  });

  app.get("/api/user", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const { password, ...userWithoutPassword } = req.user;
      return res.json(userWithoutPassword);
    }
    const teacherId = (req.session as any)?.teacherId;
    if (teacherId) {
      const teacher = await storage.getTeacher(teacherId);
      if (teacher) {
        const { password: _pw, ...teacherWithoutPassword } = teacher;
        return res.json({ ...teacherWithoutPassword, role: "teacher", username: teacher.email });
      }
    }
    return res.sendStatus(401);
  });
}
