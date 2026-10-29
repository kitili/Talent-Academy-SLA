import { randomBytes } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { academyCalendar, batchCourses, batches, batchTeachers, cohortBatchCourses, cohortBatches, courses, scheduledEvents, teachers, users } from "@shared/schema";
import { nextBatchName, sortBatches } from "@shared/academyPath";
import { parseCalendarEntry, parseFellowType, parseTrainerType, FELLOW_TYPE_LABELS } from "@shared/academyPeople";
import { parseAccessRequest } from "@shared/accessRequest";
import { db, hasDatabaseUrl } from "./db";
import { storage } from "./storage";
import { trainerOwnsBatch } from "./access";
import { trainerMayEditCourse } from "./scope";

type Guard = (req: Request, res: Response, next: NextFunction) => void;

function isStaff(user: Express.User | undefined) {
  return user?.role === "admin" || user?.role === "trainer";
}

/** The signed-in Fellow's id when this request is a Fellow's session, else undefined. */
function fellowIdOf(req: Request): string | undefined {
  const id = (req.session as any)?.teacherId;
  return typeof id === "string" && id ? id : undefined;
}

/** Fellow rows leave the server without the password hash. */
export function publicFellow<T extends { password?: unknown }>(row: T) {
  const { password: _password, ...rest } = row;
  return rest;
}

/**
 * Put a course on a cohort the way the Admin page does: on the cohort's last step, or on a first step made for it when
 * the cohort has none, and in `batch_courses` so its Fellows see it. Refuses a course the cohort already has.
 */
async function placeCourseOnCohort(courseId: string, cohortId: string, userId: string): Promise<string | null> {
  const [held] = await db
    .select({ id: batchCourses.id })
    .from(batchCourses)
    .where(and(eq(batchCourses.batchId, cohortId), eq(batchCourses.courseId, courseId)));
  if (held) return "That course is already on this cohort";
  const steps = sortBatches(await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, cohortId)));
  const step = steps[steps.length - 1]
    ?? (await db.insert(cohortBatches).values({ cohortId, name: nextBatchName(0), orderIndex: 0 }).returning())[0];
  await db.insert(cohortBatchCourses).values({ cohortBatchId: step.id, courseId }).onConflictDoNothing();
  await storage.assignCourseToBatch({ batchId: cohortId, courseId, assignedBy: userId });
  return null;
}

export function registerAcademyDeskRoutes(
  app: Express,
  isAuthenticated: Guard,
  isTrainer: Guard,
  isAdmin: Guard,
) {
  // ── Trainers register Fellows ─────────────────────────────────────────────
  // The Fellow is approved on the spot and sets their own password at sign-in ("Create your password"),
  // so the Trainer never holds or chooses a password.
  app.post("/api/trainer/fellows", isAuthenticated, isTrainer, async (req, res) => {
    try {
      if (!hasDatabaseUrl()) return res.status(503).json({ message: "Registering needs the academy database." });
      const parsed = parseAccessRequest({ ...req.body, role: "teacher" });
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      const fellowType = parseFellowType(req.body?.fellowType);
      if (!fellowType) return res.status(400).json({ message: "Choose in-house or pre-service" });

      const batchId = typeof req.body?.batchId === "string" && req.body.batchId ? req.body.batchId : null;
      if (batchId) {
        const batch = await storage.getBatch(batchId);
        if (!batch) return res.status(404).json({ message: "That cohort does not exist" });
        if (!trainerOwnsBatch(req.user, batch)) return res.status(403).json({ message: "That cohort is not yours" });
      }

      const byEmail = await storage.getTeacherByEmail(parsed.email);
      const byUsername = await storage.getTeacherByUsername(parsed.username);
      if (byEmail || byUsername) {
        return res.status(409).json({ message: "A Fellow with that email or username already exists." });
      }

      const { hashPassword } = await import("./auth");
      const locked = await hashPassword(randomBytes(24).toString("hex"));
      const fellow = await storage.createTeacher({
        name: parsed.name,
        username: parsed.username,
        email: parsed.email,
        password: locked,
        approvalStatus: "approved",
        passwordSet: "no",
        fellowType,
        approvedBy: req.user!.id,
        approvedByRole: req.user!.role,
        approvedAt: new Date(),
      } as any);

      if (batchId) {
        await db.insert(batchTeachers).values({ batchId, teacherId: fellow.id }).onConflictDoNothing();
      }
      res.status(201).json({
        fellow: publicFellow(fellow),
        message: `${fellow.name} is registered as a ${FELLOW_TYPE_LABELS[fellowType]} Fellow. They open Sign in, choose Fellow, and create their password.`,
      });
    } catch (error) {
      console.error("Register Fellow failed:", error);
      res.status(500).json({ message: "Could not register the Fellow" });
    }
  });

  /** The Fellows a Trainer registered or teaches. An Admin sees every approved Fellow. */
  app.get("/api/trainer/fellows", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const user = req.user!;
      let rows;
      if (user.role === "admin") {
        rows = await db.select().from(teachers).orderBy(asc(teachers.name));
      } else {
        const mine = await storage.getAllBatches(user.id);
        const ids = mine.map((batch: any) => batch.id as string);
        const enrolled = ids.length
          ? await db
              .select({ teacher: teachers })
              .from(batchTeachers)
              .innerJoin(teachers, eq(batchTeachers.teacherId, teachers.id))
              .where(inArray(batchTeachers.batchId, ids))
          : [];
        const registered = await db.select().from(teachers).where(eq(teachers.approvedBy, user.id));
        const seen = new Map<string, (typeof registered)[number]>();
        for (const row of enrolled.map((item) => item.teacher).concat(registered)) seen.set(row.id, row);
        rows = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
      }
      res.json(rows.map(publicFellow));
    } catch (error) {
      console.error("List Fellows failed:", error);
      res.status(500).json({ message: "Could not load Fellows" });
    }
  });

  /** An Admin or the Trainer who owns the Fellow's cohort may change a Fellow's type. */
  app.patch("/api/trainer/fellows/:id/type", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const fellowType = parseFellowType(req.body?.fellowType);
      if (!fellowType || req.body?.fellowType === undefined) return res.status(400).json({ message: "Choose in-house or pre-service" });
      const [fellow] = await db.select().from(teachers).where(eq(teachers.id, req.params.id));
      if (!fellow) return res.status(404).json({ message: "Fellow not found" });
      if (req.user!.role !== "admin") {
        const mine = await storage.getAllBatches(req.user!.id);
        const ids = mine.map((batch: any) => batch.id as string);
        const [link] = ids.length
          ? await db.select().from(batchTeachers).where(and(eq(batchTeachers.teacherId, fellow.id), inArray(batchTeachers.batchId, ids)))
          : [];
        if (!link && fellow.approvedBy !== req.user!.id) return res.status(403).json({ message: "That Fellow is not in your cohorts" });
      }
      const [updated] = await db.update(teachers).set({ fellowType }).where(eq(teachers.id, fellow.id)).returning();
      res.json(publicFellow(updated));
    } catch (error) {
      console.error("Fellow type failed:", error);
      res.status(500).json({ message: "Could not change the Fellow type" });
    }
  });

  /** Admin sets whether a Trainer is in-house or instructional. */
  app.patch("/api/admin/trainers/:id/type", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const trainerType = parseTrainerType(req.body?.trainerType);
      if (!trainerType || req.body?.trainerType === undefined) return res.status(400).json({ message: "Choose in-house or instructional" });
      const [trainer] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!trainer || trainer.role !== "trainer") return res.status(404).json({ message: "Trainer not found" });
      const [updated] = await db.update(users).set({ trainerType }).where(eq(users.id, trainer.id)).returning();
      const { password: _password, resetToken: _token, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      console.error("Trainer type failed:", error);
      res.status(500).json({ message: "Could not change the Trainer type" });
    }
  });

  // ── Trainers make courses ─────────────────────────────────────────────────
  // Any Trainer can make a course, add its modules and files, and put it on a cohort they teach. Deleting stays Admin.
  app.get("/api/trainer/courses", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const mine = req.user!.role === "admin" ? null : (await storage.getAllBatches(req.user!.id)).map((batch: any) => batch.id as string);
      const placed = mine === null || mine.length > 0
        ? await db
          .select({ courseId: batchCourses.courseId, cohortId: batches.id, cohortName: batches.name })
          .from(batchCourses)
          .innerJoin(batches, eq(batchCourses.batchId, batches.id))
          .where(mine === null ? sql`true` : inArray(batchCourses.batchId, mine))
        : [];
      const ids = Array.from(new Set(placed.map((row) => row.courseId)));
      const rows = await db
        .select()
        .from(courses)
        .where(mine === null ? sql`true` : sql`${courses.createdBy} = ${req.user!.id} OR ${ids.length ? inArray(courses.id, ids) : sql`false`}`)
        .orderBy(asc(courses.name));
      res.json(rows.map((course) => ({
        ...course,
        mine: course.createdBy === req.user!.id,
        cohorts: placed.filter((row) => row.courseId === course.id).map(({ cohortId, cohortName }) => ({ id: cohortId, name: cohortName })),
      })));
    } catch (error) {
      console.error("Trainer courses failed:", error);
      res.status(500).json({ message: "Could not load your courses" });
    }
  });

  app.post("/api/trainer/courses", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (name.length < 3) return res.status(400).json({ message: "Give the course a name" });
      const cohortId = typeof req.body?.cohortId === "string" && req.body.cohortId ? req.body.cohortId : null;
      if (cohortId) {
        const cohort = await storage.getBatch(cohortId);
        if (!cohort) return res.status(404).json({ message: "That cohort does not exist" });
        if (!trainerOwnsBatch(req.user, cohort)) return res.status(403).json({ message: "That cohort is not yours" });
      }
      const [course] = await db.insert(courses).values({
        name,
        description: req.body?.description ? String(req.body.description).trim() : null,
        publishStatus: "published",
        createdBy: req.user!.id,
      }).returning();
      if (cohortId) await placeCourseOnCohort(course.id, cohortId, req.user!.id);
      res.status(201).json(course);
    } catch (error) {
      console.error("Trainer course create failed:", error);
      res.status(500).json({ message: "Could not make the course" });
    }
  });

  app.post("/api/trainer/courses/:id/cohorts", isAuthenticated, isTrainer, async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) return res.status(404).json({ message: "Course not found" });
      if (!(await trainerMayEditCourse(req.user, course.id))) return res.status(403).json({ message: "That course is not yours" });
      const cohort = await storage.getBatch(String(req.body?.cohortId || ""));
      if (!cohort) return res.status(404).json({ message: "That cohort does not exist" });
      if (!trainerOwnsBatch(req.user, cohort)) return res.status(403).json({ message: "That cohort is not yours" });
      const refused = await placeCourseOnCohort(course.id, cohort.id, req.user!.id);
      if (refused) return res.status(409).json({ message: refused });
      res.status(201).json({ courseId: course.id, cohortId: cohort.id });
    } catch (error) {
      console.error("Trainer course placement failed:", error);
      res.status(500).json({ message: "Could not put the course on the cohort" });
    }
  });

  // ── The annual calendar ───────────────────────────────────────────────────
  // Admin writes it. Trainers and Fellows read the same rows, so nothing is copied to them, but only once the Admin
  // presses Done: until then an entry is a draft only the Admin sees.
  app.get("/api/academy-calendar", async (req, res) => {
    try {
      if (!isStaff(req.user) && !fellowIdOf(req)) return res.status(401).json({ message: "Unauthorized" });
      const admin = isStaff(req.user) && req.user!.role === "admin";
      const rows = await db
        .select()
        .from(academyCalendar)
        .where(admin ? sql`true` : isNotNull(academyCalendar.publishedAt))
        .orderBy(asc(academyCalendar.startDate));
      res.json(rows);
    } catch (error) {
      console.error("Calendar list failed:", error);
      res.status(500).json({ message: "Could not load the calendar" });
    }
  });

  app.post("/api/admin/academy-calendar", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = parseCalendarEntry(req.body);
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      const [row] = await db.insert(academyCalendar).values({ ...parsed, createdBy: req.user!.id, publishedAt: null }).returning();
      res.status(201).json(row);
    } catch (error) {
      console.error("Calendar add failed:", error);
      res.status(500).json({ message: "Could not add to the calendar" });
    }
  });

  // Done: every draft goes to Trainers and Fellows at once.
  app.post("/api/admin/academy-calendar/publish", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const published = await db
        .update(academyCalendar)
        .set({ publishedAt: new Date() })
        .where(isNull(academyCalendar.publishedAt))
        .returning({ id: academyCalendar.id });
      res.json({ published: published.length });
    } catch (error) {
      console.error("Calendar publish failed:", error);
      res.status(500).json({ message: "Could not publish the calendar" });
    }
  });

  app.patch("/api/admin/academy-calendar/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = parseCalendarEntry(req.body);
      if ("error" in parsed) return res.status(400).json({ message: parsed.error });
      const [row] = await db.update(academyCalendar).set(parsed).where(eq(academyCalendar.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Entry not found" });
      res.json(row);
    } catch (error) {
      console.error("Calendar edit failed:", error);
      res.status(500).json({ message: "Could not save the entry" });
    }
  });

  app.delete("/api/admin/academy-calendar/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const removed = await db.delete(academyCalendar).where(eq(academyCalendar.id, req.params.id)).returning();
      if (removed.length === 0) return res.status(404).json({ message: "Entry not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Calendar delete failed:", error);
      res.status(500).json({ message: "Could not remove the entry" });
    }
  });

  // ── The timetable: every cohort's sessions, scoped by who asks ────────────
  // Admin sees all cohorts, a Trainer sees the cohorts they teach, a Fellow sees the cohorts they are in.
  app.get("/api/timetable", async (req, res) => {
    try {
      const fellowId = fellowIdOf(req);
      let batchIds: string[] | null = null; // null means every cohort
      if (isStaff(req.user) && req.user!.role === "trainer") {
        const mine = await storage.getAllBatches(req.user!.id);
        batchIds = mine.map((batch: any) => batch.id as string);
      } else if (!isStaff(req.user)) {
        if (!fellowId) return res.status(401).json({ message: "Unauthorized" });
        const enrolled = await storage.getBatchesForTeacher(fellowId);
        batchIds = enrolled.map((batch) => batch.id);
      }
      if (batchIds && batchIds.length === 0) return res.json([]);

      const rows = await db
        .select({
          id: scheduledEvents.id,
          title: scheduledEvents.title,
          description: scheduledEvents.description,
          eventType: scheduledEvents.eventType,
          startDate: scheduledEvents.startDate,
          endDate: scheduledEvents.endDate,
          batchId: scheduledEvents.batchId,
          cohortName: batches.name,
          meetingUrl: scheduledEvents.meetingUrl,
          videoUrl: scheduledEvents.videoUrl,
          materialsUrl: scheduledEvents.materialsUrl,
          createdBy: scheduledEvents.createdBy,
          trainerFirstName: users.firstName,
          trainerLastName: users.lastName,
          trainerUsername: users.username,
        })
        .from(scheduledEvents)
        .innerJoin(batches, eq(scheduledEvents.batchId, batches.id))
        .leftJoin(users, eq(scheduledEvents.createdBy, users.id))
        .where(batchIds ? inArray(scheduledEvents.batchId, batchIds) : sql`true`)
        .orderBy(asc(scheduledEvents.startDate));

      res.json(rows.map(({ trainerFirstName, trainerLastName, trainerUsername, ...row }) => ({
        ...row,
        trainerName: [trainerFirstName, trainerLastName].filter(Boolean).join(" ") || trainerUsername || null,
      })));
    } catch (error) {
      console.error("Timetable failed:", error);
      res.status(500).json({ message: "Could not load the timetable" });
    }
  });
}
