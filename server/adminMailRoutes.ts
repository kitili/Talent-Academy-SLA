import type { Express } from "express";
import { deskName } from "@shared/deskName";
import type { RouteGuards } from "./routeGuards";

/** The Admin's desk mail with Trainers and Fellows. Contract: plans/sla-feedback-fixes/sla-feedback-fixes-plan.md. */

type Named = { id: string; name?: string | null; firstName?: string | null; lastName?: string | null; username?: string | null; email?: string | null };
export type MailRow = { fromId: string; fromRole: string; toId: string; toRole: string };

/** The rows these routes read. The default loads `db` lazily, as `ScopeReaders` does, so tests drive the routes with rows in memory. */
export type AdminMailStore = {
  approvedTrainers(): Promise<Named[]>;
  approvedFellows(): Promise<Named[]>;
  /** Every desk message this person sent to, or received from, someone whose role on the message is Admin. */
  adminMailOf(personId: string): Promise<MailRow[]>;
  /** Only people who are Admins now, so a reply (which requires that role) can go through. */
  adminsAmong(ids: string[]): Promise<Named[]>;
};

const databaseStore: AdminMailStore = {
  // Named columns, so a password is never read for this list.
  async approvedTrainers() {
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { and, eq } = await import("drizzle-orm");
    return db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username, email: users.email })
      .from(users)
      .where(and(eq(users.role, "trainer"), eq(users.approvalStatus, "approved")));
  },
  async approvedFellows() {
    const { db } = await import("./db");
    const { teachers } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    return db
      .select({ id: teachers.id, name: teachers.name, username: teachers.username, email: teachers.email })
      .from(teachers)
      .where(eq(teachers.approvalStatus, "approved"));
  },
  async adminMailOf(personId) {
    const { db } = await import("./db");
    const { deskMessages } = await import("@shared/schema");
    const { and, eq, or } = await import("drizzle-orm");
    return db
      .select({ fromId: deskMessages.fromId, fromRole: deskMessages.fromRole, toId: deskMessages.toId, toRole: deskMessages.toRole })
      .from(deskMessages)
      .where(or(
        and(eq(deskMessages.toId, personId), eq(deskMessages.fromRole, "admin")),
        and(eq(deskMessages.fromId, personId), eq(deskMessages.toRole, "admin")),
      ));
  },
  async adminsAmong(ids) {
    if (ids.length === 0) return [];
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { and, eq, inArray } = await import("drizzle-orm");
    return db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username, email: users.email })
      .from(users)
      .where(and(eq(users.role, "admin"), inArray(users.id, ids)));
  },
};

const peerOf = (role: string) => (person: Named) => ({ id: person.id, name: deskName(person), role });

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Everyone the Admin may write to: `[{ id, name, role }]`, Trainers first, nothing else about them. */
export function deskPeersForAdmin(trainers: Named[], fellows: Named[]) {
  return [...trainers.map(peerOf("trainer")).sort(byName), ...fellows.map(peerOf("teacher")).sort(byName)];
}

/** A Trainer's Admin threads: any Admin with a message to or from this Trainer. */
export function adminIdsForTrainer(rows: MailRow[], trainerId: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.toId === trainerId && row.fromRole === "admin") ids.add(row.fromId);
    if (row.fromId === trainerId && row.toRole === "admin") ids.add(row.toId);
  }
  return Array.from(ids);
}

/** A Fellow's Admin threads: only an Admin who wrote to this Fellow. A Fellow's own note does not open one. */
export function adminIdsForFellow(rows: MailRow[], teacherId: string) {
  return Array.from(new Set(rows.filter((row) => row.toId === teacherId && row.fromRole === "admin").map((row) => row.fromId)));
}

export function registerAdminMailRoutes(app: Express, guards: RouteGuards, store: AdminMailStore = databaseStore) {
  app.get("/api/admin/desk-peers", guards.isAuthenticated, guards.isAdmin, async (_req, res) => {
    try {
      const [trainers, fellows] = await Promise.all([store.approvedTrainers(), store.approvedFellows()]);
      res.json(deskPeersForAdmin(trainers, fellows));
    } catch (error) {
      console.error("Error listing the Admin's desk peers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/trainer/admin-threads", guards.isAuthenticated, guards.isTrainer, async (req, res) => {
    try {
      const trainerId = req.user!.id;
      const admins = await store.adminsAmong(adminIdsForTrainer(await store.adminMailOf(trainerId), trainerId));
      res.json(admins.map(peerOf("admin")).sort(byName));
    } catch (error) {
      console.error("Error listing a Trainer's Admin threads:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teacher/admin-threads", guards.isTeacherAuthenticated, async (req, res) => {
    try {
      const teacherId = req.teacherId!;
      const admins = await store.adminsAmong(adminIdsForFellow(await store.adminMailOf(teacherId), teacherId));
      res.json(admins.map(peerOf("admin")).sort(byName));
    } catch (error) {
      console.error("Error listing a Fellow's Admin threads:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
