import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { registerMaterialRoutes, type MaterialRow, type MaterialStore } from "../../../server/materialRoutes.ts";
import { guards, routeDriver } from "./routeDriver.ts";

/**
 * The real handlers and their real guard order, over rows in memory. The database calls behind the default store
 * are not run here; scripts/workflow-walkthrough.ts is where those meet a database.
 */
const BLOB = "https://abc123.public.blob.vercel-storage.com/training/notes-x1.pdf";
const MINE = "/api/batches/:batchId/materials";
const ONE = "/api/batches/:batchId/materials/:id";

const admin = { id: "admin-1", role: "admin" };
const teaching = { id: "trainer-1", role: "trainer" };
const coTeaching = { id: "trainer-2", role: "trainer" };
const outsider = { id: "trainer-9", role: "trainer" };

function setup() {
  const cohorts: Record<string, any> = {
    "cohort-1": { id: "cohort-1", name: "January intake", trainerId: "trainer-1", trainerIds: ["trainer-2"] },
    "cohort-2": { id: "cohort-2", name: "March intake", trainerId: "trainer-9", trainerIds: [] },
  };
  const rosters: Record<string, Array<{ id: string; name: string }>> = {
    "cohort-1": [{ id: "fellow-1", name: "Amina" }, { id: "fellow-2", name: "Baraka" }],
    "cohort-2": [{ id: "fellow-3", name: "Chidi" }],
  };
  const rows: MaterialRow[] = [];
  const notices: Array<{ teacherId: string; title: string; message: string; metadata: Record<string, unknown> }> = [];
  const store: MaterialStore = {
    cohort: async (id) => cohorts[id],
    roster: async (id) => rosters[id] || [],
    fellowCohorts: async (teacherId) => Object.values(cohorts).filter((cohort) => (rosters[cohort.id] || []).some((fellow) => fellow.id === teacherId)),
    materialsIn: async (ids) => rows.filter((row) => ids.includes(row.batchId)),
    insert: async (material) => {
      const row = { ...material, id: `m${rows.length + 1}`, createdAt: new Date(2026, 10, rows.length + 1).toISOString() };
      rows.push(row);
      return row;
    },
    remove: async (batchId, id) => {
      const index = rows.findIndex((row) => row.id === id && row.batchId === batchId);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    },
    notify: async (notice) => notices.push(notice),
  };
  const { app, call } = routeDriver();
  registerMaterialRoutes(app, guards, store);
  const share = (user: unknown, batchId: string, body: unknown) => call("POST", MINE, { user, params: { batchId }, body });
  return { call, rows, notices, share };
}

describe("who may share and list a cohort's materials", () => {
  it("lets an Admin and either kind of Trainer on the cohort in", async () => {
    const { call, share } = setup();
    for (const user of [admin, teaching, coTeaching]) {
      assert.equal((await share(user, "cohort-1", { title: "Notes", fileUrl: BLOB })).status, 201);
      assert.equal((await call("GET", MINE, { user, params: { batchId: "cohort-1" } })).status, 200);
    }
  });

  it("refuses a Trainer outside the cohort on every staff route, and writes nothing", async () => {
    const { call, rows, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB });
    assert.equal((await call("GET", MINE, { user: outsider, params: { batchId: "cohort-1" } })).status, 403);
    assert.equal((await share(outsider, "cohort-1", { title: "Mine", fileUrl: BLOB })).status, 403);
    assert.equal((await call("DELETE", ONE, { user: outsider, params: { batchId: "cohort-1", id: "m1" } })).status, 403);
    assert.deepEqual(rows.map((row) => row.title), ["Notes"]);
  });

  it("refuses a signed-out caller and a Fellow's session", async () => {
    const { call } = setup();
    const params = { batchId: "cohort-1" };
    assert.equal((await call("GET", MINE, { params })).status, 401);
    assert.equal((await call("POST", MINE, { params, body: {} })).status, 401);
    assert.equal((await call("DELETE", ONE, { params: { ...params, id: "m1" } })).status, 401);
    assert.equal((await call("GET", MINE, { params, session: { teacherId: "fellow-1" } })).status, 401);
  });

  it("answers 404 for a cohort that does not exist, even to staff", async () => {
    const { call, rows, share } = setup();
    assert.equal((await call("GET", MINE, { user: admin, params: { batchId: "nope" } })).status, 404);
    assert.equal((await share(teaching, "nope", { title: "Notes", fileUrl: BLOB })).status, 404);
    assert.equal(rows.length, 0);
  });

  it("gives staff the names of those a material was given to", async () => {
    const { call, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB, teacherIds: ["fellow-2"] });
    const { body } = await call("GET", MINE, { user: teaching, params: { batchId: "cohort-1" } });
    assert.deepEqual(body[0].teacherIds, ["fellow-2"]);
    assert.deepEqual(body[0].audience, [{ teacherId: "fellow-2", name: "Baraka" }]);
  });
});

describe("what POST refuses and what it sends", () => {
  it("refuses a bad link, a foreign file and a Fellow outside the cohort, and saves nothing", async () => {
    const { notices, rows, share } = setup();
    assert.equal((await share(teaching, "cohort-1", { title: "Notes", linkUrl: "javascript:alert(1)" })).status, 400);
    assert.equal((await share(teaching, "cohort-1", { title: "Notes", fileUrl: "https://evil.example/a.pdf" })).status, 400);
    assert.equal((await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB, teacherIds: ["fellow-1", "fellow-3"] })).status, 400);
    assert.equal(rows.length, 0);
    assert.equal(notices.length, 0);
  });

  it("stores the cohort from the address and the sharer from the session, not from the body", async () => {
    const { rows, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB, batchId: "cohort-2", createdBy: "someone" });
    assert.equal(rows[0].batchId, "cohort-1");
    assert.equal(rows[0].createdBy, "trainer-1");
  });

  it("notifies only the Fellows named", async () => {
    const { notices, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB, teacherIds: ["fellow-2"] });
    assert.deepEqual(notices.map((notice) => notice.teacherId), ["fellow-2"]);
    assert.match(notices[0].message, /Notes was shared with you in January intake/);
    assert.equal(notices[0].metadata.batchId, "cohort-1");
  });

  it("notifies the whole roster when nobody is named", async () => {
    const { notices, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB });
    assert.deepEqual(notices.map((notice) => notice.teacherId), ["fellow-1", "fellow-2"]);
  });
});

describe("DELETE", () => {
  it("removes a material of this cohort", async () => {
    const { call, rows, share } = setup();
    await share(teaching, "cohort-1", { title: "Notes", fileUrl: BLOB });
    assert.equal((await call("DELETE", ONE, { user: teaching, params: { batchId: "cohort-1", id: "m1" } })).status, 204);
    assert.equal(rows.length, 0);
  });

  it("will not remove another cohort's material through a cohort the Trainer teaches", async () => {
    const { call, rows, share } = setup();
    await share(outsider, "cohort-2", { title: "Theirs", fileUrl: BLOB });
    const answer = await call("DELETE", ONE, { user: teaching, params: { batchId: "cohort-1", id: "m1" } });
    assert.equal(answer.status, 404);
    assert.deepEqual(rows.map((row) => row.title), ["Theirs"]);
  });
});

describe("the database store (text contracts: no test here reaches a database)", () => {
  const module = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "server", "materialRoutes.ts"), "utf8");

  it("deletes only a row of the cohort in the address", () => {
    assert.match(module, /\.delete\(sharedMaterials\)\r?\n\s+\.where\(and\(eq\(sharedMaterials\.id, id\), eq\(sharedMaterials\.batchId, batchId\)\)\)/);
  });

  it("reads only the rows of the cohorts asked for", () => {
    assert.match(module, /\.from\(sharedMaterials\)\.where\(inArray\(sharedMaterials\.batchId, batchIds\)\)/);
  });

  it("notifies through the bell, as a Fellow", () => {
    assert.match(module, /storage\.createNotification\(\{ recipientId: teacherId, recipientType: "teacher", type: "general", title, message, metadata \}\)/);
  });
});

describe("GET /api/teacher/materials", () => {
  const read = (call: ReturnType<typeof setup>["call"], teacherId: string) => call("GET", "/api/teacher/materials", { session: { teacherId } });

  it("refuses a Trainer's session", async () => {
    const { call } = setup();
    assert.equal((await call("GET", "/api/teacher/materials", { user: teaching })).status, 401);
  });

  it("gives a Fellow what names them or the whole cohort, and nothing named for someone else", async () => {
    const { call, share } = setup();
    await share(teaching, "cohort-1", { title: "For everyone", fileUrl: BLOB });
    await share(teaching, "cohort-1", { title: "For Amina", fileUrl: BLOB, teacherIds: ["fellow-1"] });
    await share(teaching, "cohort-1", { title: "For Baraka", fileUrl: BLOB, teacherIds: ["fellow-2"] });
    const { body } = await read(call, "fellow-1");
    assert.deepEqual(body.map((material: any) => material.title), ["For Amina", "For everyone"]);
    assert.equal(JSON.stringify(body).includes("fellow-2"), false);
    assert.equal(JSON.stringify(body).includes("teacherIds"), false);
    assert.equal(body[0].cohortName, "January intake");
  });

  it("gives nothing from a cohort the Fellow is not in", async () => {
    const { call, share } = setup();
    await share(teaching, "cohort-1", { title: "January notes", fileUrl: BLOB });
    assert.deepEqual((await read(call, "fellow-3")).body, []);
    assert.deepEqual((await read(call, "not-enrolled")).body, []);
  });
});
