import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminIdsForFellow,
  adminIdsForTrainer,
  deskPeersForAdmin,
  registerAdminMailRoutes,
  type AdminMailStore,
  type MailRow,
} from "../../../server/adminMailRoutes.ts";
import { guards, routeDriver } from "../materials/routeDriver.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const admin = { id: "admin-1", role: "admin" };
const trainer = { id: "trainer-1", role: "trainer" };

const fromAdmin = (to: string, role = "trainer"): MailRow => ({ fromId: "admin-1", fromRole: "admin", toId: to, toRole: role });
const toAdmin = (from: string, role = "trainer"): MailRow => ({ fromId: from, fromRole: role, toId: "admin-1", toRole: "admin" });

function setup(mail: MailRow[] = []) {
  const people: Record<string, any> = {
    "admin-1": { id: "admin-1", firstName: "Grace", lastName: "Otieno", username: "admin" },
    "admin-2": { id: "admin-2", username: "admin", password: "hash" },
  };
  const store: AdminMailStore = {
    // The rows carry fields the answer must not, so a lost mapping fails.
    approvedTrainers: async () => [{ id: "trainer-1", firstName: "Zuri", lastName: "Mwangi", username: "zuri", email: "zuri@example.com", password: "hash" } as any],
    approvedFellows: async () => [{ id: "fellow-1", name: "Amina Hassan", email: "amina@example.com", password: "hash" } as any],
    adminMailOf: async (personId) => mail.filter((row) => row.fromId === personId || row.toId === personId),
    adminsAmong: async (ids) => ids.map((id) => people[id]).filter(Boolean),
  };
  const { app, call } = routeDriver();
  registerAdminMailRoutes(app, guards, store);
  return { call };
}

describe("GET /api/admin/desk-peers", () => {
  const PEERS = "/api/admin/desk-peers";

  it("answers an Admin with id, name and role, Trainers first", async () => {
    const { body, status } = await setup().call("GET", PEERS, { user: admin });
    assert.equal(status, 200);
    assert.deepEqual(body, [
      { id: "trainer-1", name: "Zuri Mwangi", role: "trainer" },
      { id: "fellow-1", name: "Amina Hassan", role: "teacher" },
    ]);
  });

  it("is refused to a Trainer, a Fellow and anyone signed out", async () => {
    const { call } = setup();
    assert.equal((await call("GET", PEERS, { user: trainer })).status, 403);
    assert.equal((await call("GET", PEERS, { session: { teacherId: "fellow-1" } })).status, 401);
    assert.equal((await call("GET", PEERS)).status, 401);
  });

  it("sorts each group by name, and never sends a password or an email", () => {
    const peers = deskPeersForAdmin(
      [{ id: "t2", firstName: "Zed" }, { id: "t1", firstName: "Ann" }],
      [{ id: "f2", name: "Yara", password: "hash" } as any, { id: "f1", name: "Bo", email: "bo@example.com" }],
    );
    assert.deepEqual(peers.map((peer) => peer.id), ["t1", "t2", "f1", "f2"]);
    assert.equal(/password|email|hash|@/.test(JSON.stringify(peers)), false);
  });

  it("asks only for approved people, by named columns (text contract over the database store)", () => {
    const module = source("server/adminMailRoutes.ts");
    assert.match(module, /eq\(users\.role, "trainer"\), eq\(users\.approvalStatus, "approved"\)/);
    assert.match(module, /eq\(teachers\.approvalStatus, "approved"\)/);
    assert.equal(/users\.password|teachers\.password|\.select\(\)/.test(module), false);
  });
});

describe("a Trainer's Admin threads", () => {
  const THREADS = "/api/trainer/admin-threads";

  it("lists an Admin who wrote to them or whom they wrote to", () => {
    assert.deepEqual(adminIdsForTrainer([fromAdmin("trainer-1")], "trainer-1"), ["admin-1"]);
    assert.deepEqual(adminIdsForTrainer([toAdmin("trainer-1")], "trainer-1"), ["admin-1"]);
  });

  it("does not list another Trainer's thread, or mail that does not involve an Admin", () => {
    assert.deepEqual(adminIdsForTrainer([fromAdmin("trainer-2"), toAdmin("trainer-2")], "trainer-1"), []);
    const fellowToTrainer: MailRow = { fromId: "fellow-1", fromRole: "teacher", toId: "trainer-1", toRole: "trainer" };
    assert.deepEqual(adminIdsForTrainer([fellowToTrainer], "trainer-1"), []);
  });

  it("answers the signed-in Trainer with the Admin as someone they can reply to", async () => {
    const { body, status } = await setup([fromAdmin("trainer-1"), fromAdmin("trainer-1")]).call("GET", THREADS, { user: trainer });
    assert.equal(status, 200);
    assert.deepEqual(body, [{ id: "admin-1", name: "Grace Otieno", role: "admin" }]);
  });

  it("gives an empty list when no Admin has written, and reads no one else's mail", async () => {
    const { call } = setup([fromAdmin("trainer-2")]);
    assert.deepEqual((await call("GET", THREADS, { user: trainer })).body, []);
  });

  it("is refused to a Fellow's session and anyone signed out", async () => {
    const { call } = setup();
    assert.equal((await call("GET", THREADS, { session: { teacherId: "fellow-1" } })).status, 401);
    assert.equal((await call("GET", THREADS)).status, 401);
  });
});

describe("a Fellow's Admin threads", () => {
  const THREADS = "/api/teacher/admin-threads";
  const fellowNote = toAdmin("fellow-1", "teacher");

  it("lists an Admin only when that Admin wrote to this Fellow", () => {
    assert.deepEqual(adminIdsForFellow([fromAdmin("fellow-1", "teacher")], "fellow-1"), ["admin-1"]);
    assert.deepEqual(adminIdsForFellow([fellowNote], "fellow-1"), []);
    assert.deepEqual(adminIdsForFellow([fromAdmin("fellow-2", "teacher")], "fellow-1"), []);
  });

  it("answers the Fellow in the session, whatever else is on the request", async () => {
    const { call } = setup([fromAdmin("fellow-1", "teacher"), fromAdmin("fellow-2", "teacher")]);
    const { body } = await call("GET", THREADS, { session: { teacherId: "fellow-1" }, params: { teacherId: "fellow-2" } });
    assert.deepEqual(body, [{ id: "admin-1", name: "Grace Otieno", role: "admin" }]);
    assert.deepEqual((await call("GET", THREADS, { session: { teacherId: "fellow-3" } })).body, []);
  });

  it("is refused to staff and anyone signed out", async () => {
    const { call } = setup();
    assert.equal((await call("GET", THREADS, { user: admin })).status, 401);
    assert.equal((await call("GET", THREADS)).status, 401);
  });
});

describe("the Admin goes through the desk-mail routes (text contracts over server/routes.ts)", () => {
  const routes = source("server/routes.ts");
  const handler = (start: string) => {
    const from = routes.indexOf(start);
    assert.notEqual(from, -1, `${start} is missing`);
    return routes.slice(from, routes.indexOf("\n  app.", from + 10));
  };

  it("lets an Admin past the check that stops a Trainer writing to another cohort's Fellow", () => {
    const check = routes.slice(routes.indexOf("async function staffTeachesFellow"), routes.indexOf("function fileRequestAllowed"));
    assert.match(check, /if \(user\.role === "admin"\) return true;/);
    assert.match(handler('app.post("/api/desk-messages"'), /staffTeachesFellow\(req\.user, toId\)/);
  });

  it("lets a Trainer or Fellow answer an Admin, only if the address really is an Admin", () => {
    const send = handler('app.post("/api/desk-messages"');
    assert.match(send, /toRole === "trainer" \|\| toRole === "admin"/);
    assert.match(send, /recipient\.role !== toRole/);
  });

  it("rings the recipient's bell as the role the bell reads", () => {
    assert.match(handler('app.post("/api/desk-messages"'), /recipientId: toId,\r?\n\s+recipientType: toRole,/);
    assert.match(handler('app.get("/api/notifications"'), /recipientType = user\.role \|\| "admin"/);
  });

  it("reads a thread only from the reader's own id, in both directions", () => {
    assert.match(handler('app.get("/api/desk-messages"'), /const meId = req\.teacherId \|\| \(req\.user as any\)\?\.id;\r?\n\s+if \(!meId\)[^\r\n]*\r?\n\s+const thread = await storage\.getDeskThread\(meId, withId\);/);
    const storage = source("server/storage.ts");
    const thread = storage.slice(storage.indexOf("async getDeskThread"), storage.indexOf("export const storage"));
    assert.match(thread, /eq\(deskMessages\.fromId, aId\), eq\(deskMessages\.toId, bId\)/);
    assert.match(thread, /eq\(deskMessages\.fromId, bId\), eq\(deskMessages\.toId, aId\)/);
  });

  it("hands these route modules the real guards", () => {
    assert.match(routes, /const guards = \{ isAuthenticated, isAuthenticatedAny, isTrainer, isAdmin, isTeacherAuthenticated \};/);
    assert.match(routes, /registerMaterialRoutes\(app, guards\);/);
    assert.match(routes, /registerAdminMailRoutes\(app, guards\);/);
  });
});
