// Username/Password Authentication - based on blueprint:javascript_auth_all_persistance
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { hasDatabaseUrl } from "./db";
import { loginRateLimit } from "./security";
import { User as SelectUser } from "@shared/schema";
import { matchTestLogin, TEACHER_PASSWORD, TEST_LOGINS } from "./testLogins";
import { registerAccessRequestRoutes, signInBlock } from "./accessRequests";

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

function sessionCookieClearOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
  };
}

export function endSession(req: Request, res: Response) {
  if ((req.session as any)?.teacherId) {
    delete (req.session as any).teacherId;
  }
  const done = () => {
    res.clearCookie("connect.sid", sessionCookieClearOptions());
    if (!res.headersSent) res.sendStatus(200);
  };
  const timer = setTimeout(done, 1500);
  const finish = () => {
    clearTimeout(timer);
    done();
  };
  try {
    const afterLogout = () => {
      if (req.session && typeof req.session.destroy === "function") {
        req.session.destroy(() => finish());
        return;
      }
      finish();
    };
    if (typeof req.logout === "function") {
      req.logout(() => afterLogout());
      return;
    }
    afterLogout();
  } catch {
    finish();
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function findApprovedAccount(identifier: string, password: string, role: string) {
  const wantStaff = !role || role === "admin" || role === "trainer";
  const wantTeacher = !role || role === "teacher";
  if (wantStaff) {
    let user = await storage.getUserByUsername(identifier);
    if (!user) user = await storage.getUserByEmail(identifier);
    if (
      user
      && user.approvalStatus === "approved"
      && (!role || user.role === role)
      && await comparePasswords(password, user.password)
    ) {
      return { user };
    }
  }
  if (wantTeacher) {
    let teacher = await storage.getTeacherByEmail(identifier);
    if (!teacher && /^\d+$/.test(identifier)) {
      teacher = await storage.getTeacherByTeacherId(parseInt(identifier, 10));
    }
    if (
      teacher
      && teacher.approvalStatus === "approved"
      && await comparePasswords(password, teacher.password)
    ) {
      return { teacher };
    }
  }
  return null;
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
        console.log("[AUTH] Login attempt");
        let user = await storage.getUserByUsername(username);
        if (!user) {
          user = await storage.getUserByEmail(username);
        }
        const testLogin = matchTestLogin(username, password);
        if (!user || !testLogin || testLogin.role === "teacher" || user.role !== testLogin.role) {
          return done(null, false);
        }
        const passwordMatch = await comparePasswords(password, user.password);
        if (!passwordMatch) {
          return done(null, false);
        }
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

  app.post("/api/register", async (_req, res) => {
    res.status(403).json({
      message: "This academy only accepts the test logins.",
    });
  });

  // Multi-role aware login endpoint
  app.post("/api/login", loginRateLimit, async (req, res, next) => {
    try {
      const username = String(req.body.username || "").trim();
      const password = String(req.body.password || "").trim();
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username/email and password are required" });
      }

      const requestedRole = String(req.body.role || "").trim().toLowerCase();
      let testLogin = matchTestLogin(username, password, requestedRole);
      if (!testLogin && hasDatabaseUrl()) {
        const account = await findApprovedAccount(username, password, requestedRole);
        if (account?.user) {
          req.login(account.user, (err) => {
            if (err) return next(err);
            const { password: _, ...userWithoutPassword } = account.user!;
            res.status(200).json(userWithoutPassword);
          });
          return;
        }
        if (account?.teacher) {
          (req.session as any).teacherId = account.teacher.id;
          await new Promise<void>((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
          });
          const { password: _, ...teacherWithoutPassword } = account.teacher;
          res.status(200).json({ ...teacherWithoutPassword, role: "teacher" });
          return;
        }
        const block = await signInBlock(username, requestedRole);
        if (block) return res.status(block.status).json({ message: block.message, code: block.code });
      }
      if (
        !testLogin
        && hasDatabaseUrl()
        && /^\d+$/.test(username)
        && password === TEACHER_PASSWORD
        && (!requestedRole || requestedRole === "teacher")
      ) {
        const byId = await storage.getTeacherByTeacherId(parseInt(username, 10));
        if (byId) testLogin = matchTestLogin(byId.email, TEACHER_PASSWORD, "teacher");
      }
      if (!testLogin) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          message: "Sign-in is unavailable because the live site has no database URL. Add NEON_DATABASE_URL or DATABASE_URL in Vercel, then redeploy.",
        });
      }

      const { ensureTestLogin } = await import("./ensureTestLogins");
      const ready = await ensureTestLogin(testLogin);
      if (ready.user) {
        req.login(ready.user, (err) => {
          if (err) return next(err);
          const { password: _, ...userWithoutPassword } = ready.user!;
          res.status(200).json(userWithoutPassword);
        });
        return;
      }
      if (ready.teacher) {
        (req.session as any).teacherId = ready.teacher.id;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
        const { password: _, ...teacherWithoutPassword } = ready.teacher;
        res.status(200).json({ ...teacherWithoutPassword, role: "teacher" });
        return;
      }
      return res.status(401).json({ message: "Invalid username or password" });

    } catch (error: any) {
      console.error('[AUTH] Multi-role login error:', error);
      const code = String(error?.code || error?.cause?.code || "");
      if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENOTFOUND" || error?.name === "AggregateError") {
        return res.status(503).json({ message: "Database is unreachable. Check Neon or the local Postgres URL." });
      }
      res.status(500).json({ message: "Login failed" });
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
      const allowedDesk = TEST_LOGINS.some((login) =>
        login.role === selectedRole?.role
        && selectedRole.email
        && (login.email.toLowerCase() === selectedRole.email.toLowerCase()
          || login.username.toLowerCase() === selectedRole.email.toLowerCase())
      );
      if (!selectedRole || !allowedDesk) {
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

  app.post("/api/logout", (req, res) => {
    endSession(req, res);
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
        return res.json({ ...teacherWithoutPassword, role: "teacher", username: teacher.username || teacher.email });
      }
    }
    return res.sendStatus(401);
  });

  registerAccessRequestRoutes(app);
}
