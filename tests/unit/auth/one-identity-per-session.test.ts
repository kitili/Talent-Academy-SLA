import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * One identity per session (plan N1, finding 17). A sign-in used to add `teacherId` to whatever session the browser
 * already had, so a trainer who then signed in as a teacher held both, and `/api/user` answered with the trainer.
 *
 * The sign-in routes cannot be driven here: every path to a sign-in needs the database. So these tests drive the
 * function every route signs in through, `startSession`, with the app's own session store and passport, and a text
 * contract proves each route calls it.
 */

// No database URL: the app's session store falls back to express-session's MemoryStore, and nothing connects.
for (const name of ["NEON_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "SUPABASE_DATABASE_URL"]) {
  delete process.env[name];
}

const { setupAuth, startSession } = await import("../../../server/auth.ts");
const { storage } = await import("../../../server/storage.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

// setupAuth mounts express-session on `storage.sessionStore` (which gives the store its `generate`) and registers
// passport's serializer. The app object only records what is mounted.
const mounted: Array<(req: any, res: any, next: () => void) => void> = [];
const app: any = { set() {}, use: (fn: any) => mounted.push(fn), get() {}, post() {}, put() {}, patch() {}, delete() {} };
setupAuth(app);
const initialize = mounted.find((fn) => fn.name === "initialize");

const STAFF = { id: "trainer-1", role: "trainer", username: "trainer1" } as any;
const TEACHER_ID = "teacher-1";

/** A request carrying a new, empty session, as express-session hands one to a route. */
function newRequest(): any {
  const req: any = { sessionStore: storage.sessionStore, headers: {} };
  storage.sessionStore.generate(req);
  initialize!(req, {}, () => {});
  return req;
}

/** What the next request with this session id would load. */
function stored(sid: string): Promise<any> {
  return new Promise((resolve, reject) => {
    storage.sessionStore.get(sid, (err, sess) => (err ? reject(err) : resolve(sess ?? undefined)));
  });
}

describe("one identity per session", () => {
  it("is wired to the app's session store and passport", () => {
    assert.ok(initialize, "setupAuth no longer mounts passport.initialize()");
    assert.equal(typeof storage.sessionStore.generate, "function", "setupAuth no longer mounts express-session on storage.sessionStore");
  });

  it("a teacher sign-in after a staff sign-in leaves no passport user", async () => {
    const req = newRequest();
    await startSession(req, { user: STAFF });
    const staffSid = req.sessionID;
    assert.equal((await stored(staffSid))?.passport?.user, STAFF.id, "the staff sign-in did not save its user");

    await startSession(req, { teacherId: TEACHER_ID });
    const saved = await stored(req.sessionID);
    assert.equal(saved?.teacherId, TEACHER_ID);
    assert.equal(saved?.passport?.user, undefined, "the teacher's session still holds the staff user");
    assert.notEqual(req.sessionID, staffSid, "the teacher sign-in kept the staff session id");
    assert.equal(await stored(staffSid), undefined, "the staff session is still in the store");
  });

  it("a staff sign-in after a teacher sign-in leaves no teacherId", async () => {
    const req = newRequest();
    await startSession(req, { teacherId: TEACHER_ID });
    const teacherSid = req.sessionID;
    assert.equal((await stored(teacherSid))?.teacherId, TEACHER_ID, "the teacher sign-in did not save its teacher");

    await startSession(req, { user: STAFF });
    const saved = await stored(req.sessionID);
    assert.equal(saved?.passport?.user, STAFF.id);
    assert.equal(saved?.teacherId, undefined, "the staff session still holds the teacher");
    assert.notEqual(req.sessionID, teacherSid, "the staff sign-in kept the teacher session id");
    assert.equal(await stored(teacherSid), undefined, "the teacher session is still in the store");
  });

  it("every sign-in route signs in through startSession, and nothing else writes an identity", () => {
    const auth = source("server/auth.ts");
    const teacher = source("server/teacherAuth.ts");
    // `/api/login` (staff and teacher accounts, each by account lookup and by test login) and `/api/login/select`.
    assert.equal(count(auth, /await startSession\(req, /g), 6);
    // `/api/teacher/login`, by account lookup and by test login.
    assert.equal(count(teacher, /await startSession\(req, /g), 2);
    // The one `req.login(` and the one `teacherId` write are the ones inside startSession.
    assert.equal(count(auth + teacher, /req\.log[iI]n\(/g), 1, "a route calls req.login itself");
    assert.equal(count(auth + teacher, /session[^;\n]*\.teacherId\s*=[^=]/g), 1, "a route writes teacherId itself");
  });
});
