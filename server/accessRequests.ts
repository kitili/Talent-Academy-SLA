import { randomBytes } from "crypto";
import type { Express } from "express";
import { eq, or, sql } from "drizzle-orm";
import { teachers, users } from "@shared/schema";
import { deskState, parseAccessRequest, parsePasswordSetup, signInMessage } from "@shared/accessRequest";
import { db, hasDatabaseUrl } from "./db";
import { loginRateLimit } from "./security";
import { storage } from "./storage";

async function staffByIdentifier(identifier: string) {
  const id = identifier.trim();
  const [user] = await db
    .select()
    .from(users)
    .where(or(
      sql`LOWER(${users.username}) = LOWER(${id})`,
      sql`LOWER(${users.email}) = LOWER(${id})`,
    ))
    .limit(1);
  return user;
}

async function teacherByIdentifier(identifier: string) {
  const id = identifier.trim();
  if (id.includes("@")) {
    const byEmail = await storage.getTeacherByEmail(id);
    if (byEmail) return byEmail;
  }
  const byUsername = await storage.getTeacherByUsername(id);
  if (byUsername) return byUsername;
  if (/^\d+$/.test(id)) return storage.getTeacherByTeacherId(parseInt(id, 10));
  return undefined;
}

export async function signInBlock(identifier: string, role: string) {
  if (!hasDatabaseUrl()) return null;
  const wanted = (role || "").trim().toLowerCase();
  const account = wanted === "teacher"
    ? await teacherByIdentifier(identifier)
    : await staffByIdentifier(identifier);
  if (!account) return null;
  if (wanted === "trainer" && "role" in account && account.role !== "trainer") return null;
  if (wanted === "admin" && "role" in account && account.role !== "admin") return null;
  const state = deskState(account);
  const message = signInMessage(state);
  if (!message) return null;
  return { status: 403, message, code: state };
}

function splitName(name: string) {
  const [firstName, ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

export function registerAccessRequestRoutes(app: Express) {
  app.post("/api/access-requests", loginRateLimit, async (req, res) => {
    try {
      const parsed = parseAccessRequest(req.body);
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      if (!hasDatabaseUrl()) {
        return res.status(503).json({ message: "Requests need the academy database." });
      }
      const { hashPassword } = await import("./auth");
      const lockedPassword = await hashPassword(randomBytes(24).toString("hex"));

      if (parsed.role === "trainer") {
        const existing = await staffByIdentifier(parsed.username) || await staffByIdentifier(parsed.email);
        if (existing) {
          const state = deskState(existing);
          if (state === "rejected") {
            const names = splitName(parsed.name);
            await db.update(users).set({
              approvalStatus: "pending",
              passwordSet: "no",
              password: lockedPassword,
              email: parsed.email,
              firstName: names.firstName,
              lastName: names.lastName,
              username: parsed.username,
            }).where(eq(users.id, existing.id));
            return res.status(201).json({ status: "pending" });
          }
          if (state === "pending") return res.status(200).json({ status: "pending", message: "This request is already waiting for an admin." });
          if (state === "needs_password") return res.status(409).json({ message: signInMessage(state), code: state });
          return res.status(409).json({ message: "That username or email already has a desk. Sign in instead." });
        }
        const names = splitName(parsed.name);
        await storage.createUser({
          username: parsed.username,
          email: parsed.email,
          password: lockedPassword,
          firstName: names.firstName,
          lastName: names.lastName,
          role: "trainer",
          approvalStatus: "pending",
          passwordSet: "no",
        });
        return res.status(201).json({ status: "pending" });
      }

      const existingTeacher = await teacherByIdentifier(parsed.username) || await teacherByIdentifier(parsed.email);
      if (existingTeacher) {
        const state = deskState(existingTeacher);
        if (state === "rejected") {
          await db.update(teachers).set({
            approvalStatus: "pending",
            passwordSet: "no",
            password: lockedPassword,
            email: parsed.email,
            name: parsed.name,
            username: parsed.username,
          }).where(eq(teachers.id, existingTeacher.id));
          return res.status(201).json({ status: "pending" });
        }
        if (state === "pending") return res.status(200).json({ status: "pending", message: "This request is already waiting for an admin." });
        if (state === "needs_password") return res.status(409).json({ message: signInMessage(state), code: state });
        return res.status(409).json({ message: "That username or email already has a desk. Sign in instead." });
      }
      await storage.createTeacher({
        name: parsed.name,
        username: parsed.username,
        email: parsed.email,
        password: lockedPassword,
        approvalStatus: "pending",
        passwordSet: "no",
      });
      return res.status(201).json({ status: "pending" });
    } catch (error) {
      console.error("Access request failed:", error);
      res.status(500).json({ message: "Could not save the request" });
    }
  });

  app.post("/api/access-requests/password", loginRateLimit, async (req, res) => {
    try {
      const parsed = parsePasswordSetup(req.body);
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      if (!hasDatabaseUrl()) {
        return res.status(503).json({ message: "Password setup needs the academy database." });
      }
      const account = parsed.role === "teacher"
        ? await teacherByIdentifier(parsed.identifier)
        : await staffByIdentifier(parsed.identifier);
      if (!account || ("role" in account && account.role !== parsed.role)) {
        return res.status(404).json({ message: "No desk is waiting for that username or email." });
      }
      const state = deskState(account);
      if (state !== "needs_password") {
        const message = signInMessage(state) || "This desk already has a password. Sign in.";
        return res.status(state === "approved" ? 400 : 403).json({ message, code: state });
      }
      const { hashPassword } = await import("./auth");
      const hashed = await hashPassword(parsed.password);
      if (parsed.role === "teacher") await storage.updateTeacherPassword(account.id, hashed);
      else await storage.updateUserPassword(account.id, hashed);
      res.json({ ok: true, message: "Password saved. Sign in with it." });
    } catch (error) {
      console.error("Password setup failed:", error);
      res.status(500).json({ message: "Could not save the password" });
    }
  });
}
