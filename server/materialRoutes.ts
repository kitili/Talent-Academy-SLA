import type { Express, Request, Response } from "express";
import { audienceWithNames, safeLink } from "@shared/academyPeople";
import { isBlobUrl } from "@shared/uploads";
import { trainerOwnsBatch } from "./access";
import type { RouteGuards } from "./routeGuards";

/** Materials a Trainer shares with a cohort or with named Fellows. Contract: plans/sla-feedback-fixes/sla-feedback-fixes-plan.md. */

export type MaterialRow = {
  id: string;
  batchId: string;
  title: string;
  note: string | null;
  fileUrl: string | null;
  fileName: string | null;
  linkUrl: string | null;
  teacherIds: string[];
  createdBy: string | null;
  createdAt: Date | string | null;
};

export type NewMaterial = Omit<MaterialRow, "id" | "createdAt" | "createdBy">;

type Cohort = { id: string; name: string; trainerId?: string | null; trainerIds?: string[] | null };

/** The rows these routes read and write. The default loads `storage` and `db` lazily, as `ScopeReaders` does, so tests drive the routes with rows in memory. */
export type MaterialStore = {
  cohort(batchId: string): Promise<Cohort | undefined>;
  roster(batchId: string): Promise<Array<{ id: string; name: string }>>;
  fellowCohorts(teacherId: string): Promise<Array<{ id: string; name: string }>>;
  materialsIn(batchIds: string[]): Promise<MaterialRow[]>;
  insert(material: NewMaterial & { createdBy: string | null }): Promise<MaterialRow>;
  /** Deletes the material only when it belongs to this cohort; false when no such row. */
  remove(batchId: string, id: string): Promise<boolean>;
  notify(notice: { teacherId: string; title: string; message: string; metadata: Record<string, unknown> }): Promise<unknown>;
};

const databaseStore: MaterialStore = {
  async cohort(batchId) {
    const { storage } = await import("./storage");
    return storage.getBatch(batchId);
  },
  async roster(batchId) {
    const { storage } = await import("./storage");
    return storage.getTeachersInBatch(batchId);
  },
  async fellowCohorts(teacherId) {
    const { storage } = await import("./storage");
    return storage.getBatchesForTeacher(teacherId);
  },
  async materialsIn(batchIds) {
    if (batchIds.length === 0) return [];
    const { db } = await import("./db");
    const { sharedMaterials } = await import("@shared/schema");
    const { inArray } = await import("drizzle-orm");
    return db.select().from(sharedMaterials).where(inArray(sharedMaterials.batchId, batchIds));
  },
  async insert(material) {
    const { db } = await import("./db");
    const { sharedMaterials } = await import("@shared/schema");
    const [row] = await db.insert(sharedMaterials).values(material).returning();
    return row;
  },
  async remove(batchId, id) {
    const { db } = await import("./db");
    const { sharedMaterials } = await import("@shared/schema");
    const { and, eq } = await import("drizzle-orm");
    const removed = await db
      .delete(sharedMaterials)
      .where(and(eq(sharedMaterials.id, id), eq(sharedMaterials.batchId, batchId)))
      .returning({ id: sharedMaterials.id });
    return removed.length > 0;
  },
  async notify({ teacherId, title, message, metadata }) {
    const { storage } = await import("./storage");
    return storage.createNotification({ recipientId: teacherId, recipientType: "teacher", type: "general", title, message, metadata });
  },
};

const OWN_UPLOAD_PATH = /^\/(?:api\/local-objects|objects\/local)\/[0-9a-fA-F-]{36}$/;

/**
 * A file we stored: a Vercel Blob address, or a path of the server's own upload route. A Fellow opens this address,
 * so anything else (a `javascript:` address, another site) is refused. `localObjectId` in `server/objectStorage.ts`
 * is not used here: it matches anywhere in the text, so it would pass `javascript:…/objects/local/<id>`.
 */
export function isMaterialFileUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return isBlobUrl(value) || OWN_UPLOAD_PATH.test(value);
}

export type ParsedMaterial = { error: string } | { material: Omit<NewMaterial, "batchId"> };

const optionalText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Checks a POST body against the cohort's roster. Stricter than `resolveQuizAudience` in `server/routes.ts` on purpose:
 * that one drops ids it does not recognise and reads a malformed list as the whole cohort, and either would send a
 * material to people the Trainer did not choose.
 */
export function parseMaterialBody(body: unknown, rosterIds: string[]): ParsedMaterial {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  if (!title) return { error: "Add a title" };

  const hasFile = input.fileUrl !== undefined && input.fileUrl !== null && input.fileUrl !== "";
  if (hasFile && !isMaterialFileUrl(input.fileUrl)) return { error: "That file was not uploaded here. Upload it again." };
  const fileUrl = hasFile ? (input.fileUrl as string) : null;

  const linkUrl = safeLink(input.linkUrl);
  if (linkUrl === "invalid") return { error: "Links must start with https://" };

  if (!fileUrl && !linkUrl) return { error: "Add a file or a link" };

  const requested = input.teacherIds ?? [];
  const onRoster = new Set(rosterIds);
  if (!Array.isArray(requested) || !requested.every((id) => typeof id === "string" && onRoster.has(id))) {
    return { error: "Choose Fellows who are in this cohort" };
  }

  return {
    material: {
      title,
      note: optionalText(input.note),
      fileUrl,
      fileName: fileUrl ? optionalText(input.fileName)?.slice(0, 255) ?? null : null,
      linkUrl,
      teacherIds: Array.from(new Set(requested as string[])),
    },
  };
}

/** Empty names the whole cohort. A row that is not a list reaches nobody: the default is never to widen. */
export function materialReachesFellow(material: { teacherIds?: unknown }, teacherId: string) {
  const named = material.teacherIds;
  if (!Array.isArray(named)) return false;
  return named.length === 0 || named.includes(teacherId);
}

export function newestFirst<T extends { createdAt: Date | string | null }>(rows: T[]) {
  const timeOf = (row: T) => (row.createdAt ? new Date(row.createdAt).getTime() : 0);
  return [...rows].sort((a, b) => timeOf(b) - timeOf(a));
}

/** What a Fellow receives: their own materials, newest first, with the cohort's name, and never who else was named. */
export function materialsForFellow(rows: MaterialRow[], teacherId: string, cohorts: Array<{ id: string; name: string }>) {
  const cohortNames = new Map(cohorts.map((cohort) => [cohort.id, cohort.name]));
  return newestFirst(rows)
    .filter((row) => cohortNames.has(row.batchId) && materialReachesFellow(row, teacherId))
    .map((row) => ({
      id: row.id,
      batchId: row.batchId,
      cohortName: cohortNames.get(row.batchId) as string,
      title: row.title,
      note: row.note,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      linkUrl: row.linkUrl,
      createdAt: row.createdAt,
    }));
}

/** The Fellows a new material goes to: those named, or everyone on the roster when nobody is. */
export function materialRecipients(teacherIds: string[], rosterIds: string[]) {
  return teacherIds.length > 0 ? teacherIds : rosterIds;
}

/**
 * The cohort when this Admin or Trainer may act on it, otherwise answers and returns null.
 */
async function cohortForStaff(req: Request, res: Response, store: MaterialStore) {
  const cohort = await store.cohort(req.params.batchId);
  if (!cohort) {
    res.status(404).json({ error: "Cohort not found" });
    return null;
  }
  if (!trainerOwnsBatch(req.user, cohort)) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return cohort;
}

function withAudience(row: MaterialRow, roster: Array<{ id: string; name: string }>) {
  const names = Object.fromEntries(roster.map((fellow) => [fellow.id, fellow.name]));
  return { ...row, audience: audienceWithNames(row.teacherIds, names) };
}

export function registerMaterialRoutes(app: Express, guards: RouteGuards, store: MaterialStore = databaseStore) {
  app.get("/api/batches/:batchId/materials", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const cohort = await cohortForStaff(req, res, store);
      if (!cohort) return;
      const [rows, roster] = await Promise.all([store.materialsIn([cohort.id]), store.roster(cohort.id)]);
      res.json(newestFirst(rows).map((row) => withAudience(row, roster)));
    } catch (error) {
      console.error("Error listing materials:", error);
      res.status(500).json({ error: "Failed to list materials" });
    }
  });

  app.post("/api/batches/:batchId/materials", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const cohort = await cohortForStaff(req, res, store);
      if (!cohort) return;
      const roster = await store.roster(cohort.id);
      const rosterIds = roster.map((fellow) => fellow.id);
      const parsed = parseMaterialBody(req.body, rosterIds);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      const row = await store.insert({ ...parsed.material, batchId: cohort.id, createdBy: req.user?.id ?? null });
      // Awaited, because a Vercel function can stop once it has answered. A failed notice does not undo the material.
      await Promise.all(materialRecipients(row.teacherIds, rosterIds).map((teacherId) => store.notify({
        teacherId,
        title: "A new material for you",
        message: `${row.title} was shared with you in ${cohort.name}.`,
        metadata: { batchId: cohort.id, materialId: row.id },
      }))).catch((error) => console.error("Material notice failed:", error));
      res.status(201).json(withAudience(row, roster));
    } catch (error) {
      console.error("Error sharing material:", error);
      res.status(500).json({ error: "Failed to share the material" });
    }
  });

  app.delete("/api/batches/:batchId/materials/:id", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const cohort = await cohortForStaff(req, res, store);
      if (!cohort) return;
      if (!(await store.remove(cohort.id, req.params.id))) return res.status(404).json({ error: "Material not found" });
      res.sendStatus(204);
    } catch (error) {
      console.error("Error removing material:", error);
      res.status(500).json({ error: "Failed to remove the material" });
    }
  });

  app.get("/api/teacher/materials", guards.isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const cohorts = await store.fellowCohorts(teacherId);
      const rows = await store.materialsIn(cohorts.map((cohort) => cohort.id));
      res.json(materialsForFellow(rows, teacherId, cohorts));
    } catch (error) {
      console.error("Error listing a Fellow's materials:", error);
      res.status(500).json({ error: "Failed to list materials" });
    }
  });
}
