import type { Express, Request, Response, NextFunction } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  academySettings,
  batches,
  cohortBatchCourses,
  cohortBatches,
  courses,
  teacherCourseCompletion,
  users,
} from "@shared/schema";
import { ACADEMY_TERMS, normalizeCohortsRequired, pathSummary } from "@shared/academyPath";

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
  return steps.map((step) => ({
    id: step.id,
    name: step.name,
    description: step.description,
    orderIndex: step.orderIndex,
    courses: links
      .filter((link) => link.cohortBatchId === step.id)
      .map((link) => ({ id: link.courseId, name: link.courseName })),
  }));
}

async function loadTree() {
  const cohortRows = await db.select().from(batches).orderBy(asc(batches.createdAt));
  const trainerRows = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(eq(users.role, "trainer"));
  const courseRows = await db
    .select({
      id: courses.id,
      name: courses.name,
      description: courses.description,
      publishStatus: courses.publishStatus,
    })
    .from(courses)
    .orderBy(asc(courses.orderIndex), asc(courses.name));
  const cohorts = [];
  for (const cohort of cohortRows) {
    cohorts.push({
      id: cohort.id,
      name: cohort.name,
      description: cohort.description,
      track: cohort.track,
      stage: cohort.stage,
      trainerId: cohort.trainerId,
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
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Batch name is required" });
      const cohort = await storage.getBatch(req.params.cohortId);
      if (!cohort) return res.status(404).json({ error: "Cohort not found" });
      const existing = await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, cohort.id));
      const orderIndex = existing.reduce((max, step) => Math.max(max, step.orderIndex), -1) + 1;
      const [created] = await db.insert(cohortBatches).values({
        cohortId: cohort.id,
        name,
        description: req.body?.description ? String(req.body.description) : null,
        orderIndex,
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating batch:", error);
      res.status(500).json({ error: "Failed to add a batch" });
    }
  });

  app.patch("/api/admin/academy-path/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [existing] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!existing) return res.status(404).json({ error: "Batch not found" });
      const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
      if (!name) return res.status(400).json({ error: "Batch name is required" });
      const [updated] = await db.update(cohortBatches).set({
        name,
        description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : existing.description,
      }).where(eq(cohortBatches.id, existing.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating batch:", error);
      res.status(500).json({ error: "Failed to update the batch" });
    }
  });

  app.delete("/api/admin/academy-path/batches/:batchId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [existing] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!existing) return res.status(404).json({ error: "Batch not found" });
      const links = await db.select().from(cohortBatchCourses).where(eq(cohortBatchCourses.cohortBatchId, existing.id));
      await db.delete(cohortBatches).where(eq(cohortBatches.id, existing.id));
      const siblings = await db.select().from(cohortBatches).where(eq(cohortBatches.cohortId, existing.cohortId));
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
      res.status(500).json({ error: "Failed to remove the batch" });
    }
  });

  app.post("/api/admin/academy-path/batches/:batchId/courses", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const courseId = String(req.body?.courseId || "");
      const [step] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!step) return res.status(404).json({ error: "Batch not found" });
      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ error: "Course not found" });
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
        return res.status(409).json({ error: "That course is already on this batch" });
      }
      console.error("Error adding course to batch:", error);
      res.status(500).json({ error: "Failed to add the course" });
    }
  });

  app.delete("/api/admin/academy-path/batches/:batchId/courses/:courseId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [step] = await db.select().from(cohortBatches).where(eq(cohortBatches.id, req.params.batchId));
      if (!step) return res.status(404).json({ error: "Batch not found" });
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
