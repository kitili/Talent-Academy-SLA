import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  academySettings,
  batches,
  batchTeachers,
  cohortBatchCourses,
  cohortBatchTeachers,
  cohortBatches,
  cohortTrainers,
  courses,
  teacherCourseCompletion,
  teachers,
  users,
} from "@shared/schema";
import { enrolmentsToAdd, rosterChanges } from "./cohortRoster";
import { ACADEMY_TERMS, batchHoldingCourse, moveBatchOrder, nextBatchName, normalizeCohortsRequired, pathSummary, sortBatches } from "@shared/academyPath";

const SETTINGS_ID = "path";

type Guard = (req: Request, res: Response, next: NextFunction) => void;

async function readCohortsRequired() {
  const [row] = await db.select().from(academySettings).where(eq(academySettings.id, SETTINGS_ID));
  return row?.cohortsRequired ?? null;
}

async function stepsForCohort(cohortId: string) {
  const steps = await db
    .select()
    .from(cohortBatches)
    .where(eq(cohortBatches.cohortId, cohortId))
    .orderBy(asc(cohortBatches.orderIndex), asc(cohortBatches.createdAt));
  if (steps.length === 0) return [];
  const links = await db
    .select({
      id: cohortBatchCourses.id,
      cohortBatchId: cohortBatchCourses.cohortBatchId,
      courseId: courses.id,
      courseName: courses.name,
      orderIndex: cohortBatchCourses.orderIndex,
    })
    .from(cohortBatchCourses)
    .innerJoin(courses, eq(cohortBatchCourses.courseId, courses.id))
    .where(inArray(cohortBatchCourses.cohortBatchId, steps.map((step) => step.id)))
    .orderBy(asc(cohortBatchCourses.orderIndex));
  const teacherLinks = await db
    .select({
      cohortBatchId: cohortBatchTeachers.cohortBatchId,
      id: teachers.id,
      name: teachers.name,
      email: teachers.email,
    })
    .from(cohortBatchTeachers)
    .innerJoin(teachers, eq(cohortBatchTeachers.teacherId, teachers.id))
    .where(inArray(cohortBatchTeachers.cohortBatchId, steps.map((step) => step.id)));
  return sortBatches(steps).map((step) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    orderIndex: step.orderIndex,
    courses: links
      .filter((link) => link.cohortBatchId === step.id)
      .map((link) => ({ id: link.courseId, name: link.courseName })),
    teachers: teacherLinks
      .filter((link) => link.cohortBatchId === step.id)
      .map((link) => ({ id: link.id, name: link.name, email: link.email })),
  }));
}

async function writeBatchOrder(ids: string[]) {
  for (let index = 0; index < ids.length; index += 1) {
    await db.update(cohortBatches).set({ orderIndex: index }).where(eq(cohortBatches.id, ids[index]));
  }
}

async function loadTree() {
  const cohortRows = await db.select().from(batches).orderBy(asc(batches.createdAt));
  const trainerRows = (await db
    .select({ id: users.id, username: users.username, email: users.email, approvalStatus: users.approvalStatus })
    .from(users)
    .where(eq(users.role, "trainer")))
    .filter((trainer) => trainer.approvalStatus !== "inactive");
  const courseRows = await db
    .select({
      id: courses.id,
      name: courses.name,
      description: courses.description,
      publishStatus: courses.publishStatus,
    })
    .from(courses)
    .orderBy(asc(courses.orderIndex), asc(courses.name));
  const trainerLinks = await db.select().from(cohortTrainers);
  const teacherRows = await db
    .select({ id: teachers.id, name: teachers.name, email: teachers.email, approvalStatus: teachers.approvalStatus })
    .from(teachers)
    .orderBy(asc(teachers.name));
  // The Fellows enrolled in each cohort (`batch_teachers`), whoever put them there: an Admin, a Trainer or a CSV import.
  const enrolments = await db
    .select({ cohortId: batchTeachers.batchId, id: teachers.id, name: teachers.name, email: teachers.email })
    .from(batchTeachers)
    .innerJoin(teachers, eq(batchTeachers.teacherId, teachers.id))
    .orderBy(asc(teachers.name));
  const cohorts = [];
  for (const cohort of cohortRows) {
    const trainerIds = trainerLinks
      .filter((link) => link.cohortId === cohort.id)
      .map((link) => link.trainerId);
    if (cohort.trainerId && !trainerIds.includes(cohort.trainerId)) trainerIds.unshift(cohort.trainerId);
    cohorts.push({
      id: cohort.id,
      name: cohort.name,
      description: cohort.description,
      track: cohort.track,
      stage: cohort.stage,
      trainerId: cohort.trainerId,
      trainerIds,
      status: cohort.status,
      quizzesStatus: cohort.quizzesStatus,
      fellows: enrolments
        .filter((row) => row.cohortId === cohort.id)
        .map((row) => ({ id: row.id, name: row.name, email: row.email })),
      batches: await stepsForCohort(cohort.id),
    });
  }
  const saved = await readCohortsRequired();
  const cohortsRequired = normalizeCohortsRequired(saved ?? (cohorts.length || 1));
  return {
    terms: ACADEMY_TERMS,
    cohortsRequired,
    cohortsRequiredSaved: saved !== null,
    cohorts,
    courses: courseRows,
    trainers: trainerRows,
    teachers: teacherRows.filter((teacher) => teacher.approvalStatus !== "inactive"),
  };
}

async function courseCompleted(teacherId: string, cohortId: string, courseId: string) {
  const [row] = await db
    .select()
    .from(teacherCourseCompletion)
    .where(and(
      eq(teacherCourseCompletion.teacherId, teacherId),
      eq(teacherCourseCompletion.batchId, cohortId),
      eq(teacherCourseCompletion.courseId, courseId),
    ));
  if (!row) return false;
  if (row.status === "completed") return true;
  return row.totalWeeks > 0 && row.completedWeeks >= row.totalWeeks;
}

export function registerAcademyPathRoutes(
  app: Express,
  isAuthenticated: Guard,
  isAdmin: Guard,
  isTeacherAuthenticated: Guard,
) {
  app.get("/api/admin/academy-path", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      res.json(await loadTree());
    } catch (error) {
      console.error("Error loading academy path:", error);
      res.status(500).json({ error: "Failed to load the academy path" });
    }
  });

  app.put("/api/admin/academy-path", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const cohortsRequired = normalizeCohortsRequired(req.body?.cohortsRequired);
      const [saved] = await db
        .insert(academySettings)
        .values({ id: SETTINGS_ID, cohortsRequired, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: academySettings.id,
          set: { cohortsRequired, updatedAt: new Date() },
        })
        .returning();
      res.json({ cohortsRequired: saved.cohortsRequired });
    } catch (error) {
      console.error("Error saving cohorts required:", error);
      res.status(500).json({ error: "Failed to save how many cohorts a teacher must finish" });
    }
  });

  app.post("/api/admin/academy-path/cohorts/:cohortId/batches", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const cohort = await storage.getBatch(req.params.cohortId);
      if (!cohort) return res.status(404).json({ error: "Cohort not found" });
      const existing = sortBatches(await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, cohort.id)));
      const name = String(req.body?.name || "").trim() || nextBatchName(existing.length);
      const [created] = await db.insert(cohortBatches).values({
        cohortId: cohort.id,
        name,
        description: req.body?.description ? String(req.body.description) : null,
        orderIndex: existing.length,
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating batch:", error);
      res.status(500).json({ error: "Failed to add a step" });
    }
  });

  app.patch("/api/admin/academy-path/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [existing] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!existing) return res.status(404).json({ error: "Step not found" });
      const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
      if (!name) return res.status(400).json({ error: "Step name is required" });
      const [updated] = await db.update(cohortBatches).set({
        name,
        description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : existing.description,
      }).where(eq(cohortBatches.id, existing.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating batch:", error);
      res.status(500).json({ error: "Failed to update the step" });
    }
  });

  app.delete("/api/admin/academy-path/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [existing] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!existing) return res.status(404).json({ error: "Step not found" });
      const links = await db.select().from(cohortBatchCourses).where(eq(cohortBatchCourses.cohortBatchId, existing.id));
      await db.delete(cohortBatches).where(eq(cohortBatches.id, existing.id));
      const siblings = sortBatches(await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, existing.cohortId)));
      await writeBatchOrder(siblings.map((row) => row.id));
      const siblingIds = siblings.map((row) => row.id);
      for (const link of links) {
        const stillUsed = siblingIds.length === 0 ? [] : await db.select().from(cohortBatchCourses).where(and(
          inArray(cohortBatchCourses.cohortBatchId, siblingIds),
          eq(cohortBatchCourses.courseId, link.courseId),
        ));
        if (stillUsed.length === 0) {
          await storage.removeCoursesFromBatch(existing.cohortId, link.courseId);
        }
      }
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: "Failed to remove the step" });
    }
  });

  app.patch("/api/admin/academy-path/batches/:batchId/order", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const direction = req.body?.direction === "later" ? "later" : "earlier";
      const [existing] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!existing) return res.status(404).json({ error: "Step not found" });
      const siblings = sortBatches(await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, existing.cohortId)));
      const order = moveBatchOrder(siblings.map((row) => row.id), existing.id, direction);
      await writeBatchOrder(order);
      res.json({ order });
    } catch (error) {
      console.error("Error reordering batch:", error);
      res.status(500).json({ error: "Failed to reorder the step" });
    }
  });

  app.post("/api/admin/academy-path/batches/:batchId/courses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const courseId = String(req.body?.courseId || "");
      const [step] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!step) return res.status(404).json({ error: "Step not found" });
      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ error: "Course not found" });
      const held = batchHoldingCourse(await stepsForCohort(step.cohortId), course.id);
      if (held) return res.status(409).json({ error: `That course is already on ${held.name}. Each batch has its own courses.` });
      const [link] = await db.insert(cohortBatchCourses).values({
        cohortBatchId: step.id,
        courseId: course.id,
      }).returning();
      try {
        await storage.assignCourseToBatch({
          batchId: step.cohortId,
          courseId: course.id,
          assignedBy: req.user!.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("already assigned")) throw error;
      }
      res.status(201).json(link);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/duplicate|unique/i.test(message)) {
        return res.status(409).json({ error: "That course is already on this step" });
      }
      console.error("Error adding course to batch:", error);
      res.status(500).json({ error: "Failed to add the course" });
    }
  });

  app.delete("/api/admin/academy-path/batches/:batchId/courses/:courseId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [step] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!step) return res.status(404).json({ error: "Step not found" });
      await db.delete(cohortBatchCourses).where(and(
        eq(cohortBatchCourses.cohortBatchId, step.id),
        eq(cohortBatchCourses.courseId, req.params.courseId),
      ));
      const siblings = await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, step.cohortId));
      const siblingIds = siblings.map((row) => row.id);
      const stillUsed = siblingIds.length === 0 ? [] : await db.select().from(cohortBatchCourses).where(and(
        inArray(cohortBatchCourses.cohortBatchId, siblingIds),
        eq(cohortBatchCourses.courseId, req.params.courseId),
      ));
      if (stillUsed.length === 0) {
        await storage.removeCoursesFromBatch(step.cohortId, req.params.courseId);
      }
      res.sendStatus(204);
    } catch (error) {
      console.error("Error removing course from batch:", error);
      res.status(500).json({ error: "Failed to remove the course" });
    }
  });

  app.put("/api/admin/academy-path/cohorts/:cohortId/trainers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const cohort = await storage.getBatch(req.params.cohortId);
      if (!cohort) return res.status(404).json({ error: "Cohort not found" });
      const trainerIds = [...new Set((Array.isArray(req.body?.trainerIds) ? req.body.trainerIds : []).map((id: unknown) => String(id)))];
      if (trainerIds.length > 0) {
        const known = await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, trainerIds), eq(users.role, "trainer")));
        if (known.length !== trainerIds.length) {
          return res.status(400).json({ error: "Choose trainers from the trainer list" });
        }
      }
      await db.delete(cohortTrainers).where(eq(cohortTrainers.cohortId, cohort.id));
      if (trainerIds.length > 0) {
        await db.insert(cohortTrainers).values(trainerIds.map((trainerId) => ({ cohortId: cohort.id, trainerId })));
      }
      await db.update(batches).set({ trainerId: trainerIds[0] || null }).where(eq(batches.id, cohort.id));
      res.json({ trainerIds });
    } catch (error) {
      console.error("Error saving cohort trainers:", error);
      res.status(500).json({ error: "Failed to save trainers" });
    }
  });

  app.put("/api/admin/academy-path/batches/:batchId/teachers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [step] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!step) return res.status(404).json({ error: "Step not found" });
      const teacherIds = [...new Set((Array.isArray(req.body?.teacherIds) ? req.body.teacherIds : []).map((id: unknown) => String(id)))];
      if (teacherIds.length > 0) {
        const known = await db.select({ id: teachers.id }).from(teachers).where(inArray(teachers.id, teacherIds));
        if (known.length !== teacherIds.length) {
          return res.status(400).json({ error: "Choose Fellows from the Fellow list" });
        }
      }
      const stepBefore = await db
        .select({ teacherId: cohortBatchTeachers.teacherId })
        .from(cohortBatchTeachers)
        .where(eq(cohortBatchTeachers.cohortBatchId, step.id));
      await db.delete(cohortBatchTeachers).where(eq(cohortBatchTeachers.cohortBatchId, step.id));
      if (teacherIds.length > 0) {
        await db.insert(cohortBatchTeachers).values(teacherIds.map((teacherId) => ({ cohortBatchId: step.id, teacherId })));
      }
      // D9: a step save adds the Fellows it newly ticks to the cohort and never removes an enrolment.
      // Taking a Fellow out of the cohort is the roster's Remove.
      const enrolled = await db
        .select({ teacherId: batchTeachers.teacherId })
        .from(batchTeachers)
        .where(eq(batchTeachers.batchId, step.cohortId));
      const toEnrol = enrolmentsToAdd({
        stepBefore: stepBefore.map((row) => row.teacherId),
        stepAfter: teacherIds,
        enrolled: enrolled.map((row) => row.teacherId),
      });
      if (toEnrol.length > 0) {
        await db.insert(batchTeachers).values(toEnrol.map((teacherId) => ({ batchId: step.cohortId, teacherId }))).onConflictDoNothing();
      }
      res.json({ teacherIds });
    } catch (error) {
      console.error("Error saving batch teachers:", error);
      res.status(500).json({ error: "Failed to save teachers" });
    }
  });

  // The cohort roster: who is enrolled. Newly ticked Fellows join the cohort; Fellows no longer ticked leave it
  // (and any step they were ticked on). Their progress rows stay.
  app.put("/api/admin/academy-path/cohorts/:cohortId/teachers", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const cohort = await storage.getBatch(req.params.cohortId);
      if (!cohort) return res.status(404).json({ error: "Cohort not found" });
      const wanted: string[] = Array.from(new Set((Array.isArray(req.body?.teacherIds) ? req.body.teacherIds : []).map((id: unknown) => String(id))));
      if (wanted.length > 0) {
        const known = await db.select({ id: teachers.id }).from(teachers).where(inArray(teachers.id, wanted));
        if (known.length !== wanted.length) return res.status(400).json({ error: "Choose Fellows from the Fellow list" });
      }
      const rows = await db.select({ teacherId: batchTeachers.teacherId }).from(batchTeachers).where(eq(batchTeachers.batchId, cohort.id));
      const { add, remove } = rosterChanges({ current: rows.map((row) => row.teacherId), wanted });
      if (add.length > 0) {
        await db.insert(batchTeachers).values(add.map((teacherId) => ({ batchId: cohort.id, teacherId }))).onConflictDoNothing();
      }
      if (remove.length > 0) {
        await db.delete(batchTeachers).where(and(eq(batchTeachers.batchId, cohort.id), inArray(batchTeachers.teacherId, remove)));
        const steps = await db.select({ id: cohortBatches.id }).from(cohortBatches).where(eq(cohortBatches.cohortId, cohort.id));
        if (steps.length > 0) {
          await db.delete(cohortBatchTeachers).where(and(
            inArray(cohortBatchTeachers.cohortBatchId, steps.map((step) => step.id)),
            inArray(cohortBatchTeachers.teacherId, remove),
          ));
        }
      }
      res.json({ teacherIds: wanted, added: add.length, removed: remove.length });
    } catch (error) {
      console.error("Error saving cohort roster:", error);
      res.status(500).json({ error: "Failed to save the roster" });
    }
  });

  app.get("/api/teacher/academy-path", isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const enrolled = await storage.getBatchesForTeacher(teacherId);
      const saved = await readCohortsRequired();
      const cohorts = [];
      for (const cohort of enrolled) {
        const steps = await stepsForCohort(cohort.id);
        const batchesWithProgress = [];
        for (const step of steps) {
          const withFlags = [];
          for (const course of step.courses) {
            withFlags.push({
              ...course,
              completed: await courseCompleted(teacherId, cohort.id, course.id),
            });
          }
          batchesWithProgress.push({ ...step, courses: withFlags });
        }
        cohorts.push({ id: cohort.id, name: cohort.name, batches: batchesWithProgress });
      }
      const summary = pathSummary(cohorts, saved ?? (cohorts.length || 1));
      res.json({ ...summary, cohorts });
    } catch (error) {
      console.error("Error loading teacher path:", error);
      res.status(500).json({ error: "Failed to load your path" });
    }
  });
}
