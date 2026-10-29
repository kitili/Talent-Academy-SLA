import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Route handlers call `storage` and `db` directly, so none can be driven without a database. These are text
 * contracts: they prove each rule is written in the route that enforces it. The behaviour is run by hand in the
 * workflow walkthrough (the workflow walkthrough).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const desk = source("server/academyDesk.ts");
const routes = source("server/routes.ts");
const storage = source("server/storage.ts");
const auth = source("server/auth.ts");
const accessRequests = source("server/accessRequests.ts");
const schema = source("shared/schema.ts");

/** The text of one route: from its `app.<verb>("path"` to the next `app.` call. */
function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("trainers register Fellows", () => {
  const register = route(desk, "post", "/api/trainer/fellows");
  it("is a Trainer route that approves the Fellow and leaves the password to them", () => {
    assert.match(register, /isAuthenticated, isTrainer/);
    assert.match(register, /approvalStatus: "approved"/);
    assert.match(register, /passwordSet: "no"/);
    assert.match(register, /randomBytes\(24\)/);
    assert.match(register, /approvedBy: req\.user!\.id/);
  });
  it("only enrols into a cohort the Trainer teaches, and refuses a duplicate", () => {
    assert.match(register, /trainerOwnsBatch\(req\.user, batch\)/);
    assert.match(register, /409/);
    assert.match(register, /getTeacherByEmail/);
    assert.match(register, /getTeacherByUsername/);
  });
  it("never sends a password hash back", () => {
    assert.match(register, /publicFellow\(fellow\)/);
    assert.match(route(desk, "get", "/api/trainer/fellows"), /rows\.map\(publicFellow\)/);
    assert.match(routes, /teachers: teachers\.map\(publicFellow\)/);
  });
  it("only an Admin changes a Trainer's kind, and the Fellow kind is limited to the Trainer's own Fellows", () => {
    assert.match(route(desk, "patch", "/api/admin/trainers/:id/type"), /isAuthenticated, isAdmin/);
    assert.match(route(desk, "patch", "/api/trainer/fellows/:id/type"), /That Fellow is not in your cohorts/);
  });
});

describe("the annual calendar", () => {
  it("is written by Admin only and read by any signed-in desk", () => {
    for (const [verb, path] of [["post", "/api/admin/academy-calendar"], ["patch", "/api/admin/academy-calendar/:id"], ["delete", "/api/admin/academy-calendar/:id"]]) {
      assert.match(route(desk, verb, path), /isAuthenticated, isAdmin/, `${verb} ${path}`);
    }
    const read = route(desk, "get", "/api/academy-calendar");
    assert.match(read, /isStaff\(req\.user\)/);
    assert.match(read, /fellowIdOf\(req\)/);
    assert.match(read, /401/);
  });
  it("is one table everyone reads, so nothing is copied to a Trainer or Fellow", () => {
    assert.match(schema, /pgTable\("academy_calendar"/);
    assert.equal(/academy_calendar/.test(storage), false);
  });
});

describe("the timetable", () => {
  const timetable = route(desk, "get", "/api/timetable");
  it("scopes by who asks: Admin all cohorts, Trainer theirs, Fellow where enrolled", () => {
    assert.match(timetable, /getAllBatches\(req\.user!\.id\)/);
    assert.match(timetable, /getBatchesForTeacher\(fellowId\)/);
    assert.match(timetable, /batchIds \? inArray\(scheduledEvents\.batchId, batchIds\) : sql`true`/);
    assert.match(timetable, /401/);
  });
  it("carries the online links Fellows open", () => {
    for (const column of ["meetingUrl", "videoUrl", "materialsUrl"]) assert.match(timetable, new RegExp(column));
  });
});

describe("sessions (scheduled events)", () => {
  it("a Trainer schedules, lists and removes sessions only in a cohort they teach", () => {
    for (const [verb, path] of [["post", "/api/batches/:batchId/events"], ["get", "/api/batches/:batchId/events"], ["delete", "/api/events/:id"]]) {
      assert.match(route(routes, verb, path), /staffCanAccessBatch\(req\.user, batch\)/, `${verb} ${path}`);
    }
  });
  it("only an instructional Trainer or an Admin may attach a meeting, video or materials link", () => {
    const create = route(routes, "post", "/api/batches/:batchId/events");
    assert.match(create, /parseOnlineFields\(req\.body, req\.user as any\)/);
    assert.match(create, /403/);
  });
  it("stores the three online columns", () => {
    for (const column of ["meeting_url", "video_url", "materials_url"]) assert.match(schema, new RegExp(column));
  });
});

describe("assessments reach the Fellows they are shared with", () => {
  it("an assessment records its audience and notifies only those Fellows", () => {
    const create = route(routes, "post", "/api/batches/:batchId/assignments");
    assert.match(create, /resolveQuizAudience\(batch\.id, req\.body\?\.teacherIds\)/);
    assert.match(create, /replaceWrittenAssignmentAudience\(assignment\.id, audience\.teacherIds\)/);
    assert.match(create, /notifyQuizTeachers\(/);
  });
  it("a Fellow lists only work for their cohort and audience, and can only answer work they can see", () => {
    assert.match(storage, /NOT EXISTS \(SELECT 1 FROM written_assignment_teachers a WHERE a\.assignment_id = wa\.id\)/);
    const submit = route(routes, "post", "/api/teacher/assignments/:assignmentId/submit");
    assert.match(submit, /teacherCanSeeAssignment\(req\.params\.assignmentId, req\.teacherId!\)/);
    assert.match(submit, /403/);
  });
  it("the audience picker says where to register Fellows when a cohort has none", () => {
    const trainer = source("client/src/pages/trainer-batches.tsx");
    assert.match(trainer, /href="\/trainer\/fellows"/);
    assert.match(trainer, /teacherIds: quizTeacherIds/);
  });
});

describe("sign-in after an approved request", () => {
  it("finds every desk a username, email or Fellow ID opens, in any capitals", () => {
    assert.match(accessRequests, /LOWER\(\$\{teachers\.username\}\) = LOWER/);
    assert.match(accessRequests, /LOWER\(\$\{users\.username\}\) = LOWER/);
    assert.match(accessRequests, /teachers\.teacherId, parseInt/);
    assert.match(auth, /await pickApprovedStaff\(await staffCandidates\(identifier\)/);
    assert.match(auth, /await pickApprovedTeacher\(await teacherCandidates\(identifier\)/);
  });
  it("stores the kind a person asked for", () => {
    assert.match(accessRequests, /trainerType: parsed\.type/);
    assert.match(accessRequests, /fellowType: parsed\.type/);
  });
});

describe("the academy year is a draft until the Admin presses Done", () => {
  it("shows drafts to the Admin only", () => {
    const read = route(desk, "get", "/api/academy-calendar");
    assert.match(read, /const admin = isStaff\(req\.user\) && req\.user!\.role === "admin"/);
    assert.match(read, /admin \? sql`true` : isNotNull\(academyCalendar\.publishedAt\)/);
  });
  it("starts every new entry as a draft", () => {
    assert.match(route(desk, "post", "/api/admin/academy-calendar"), /publishedAt: null/);
  });
  it("publishes every draft at once, Admin only", () => {
    const publish = route(desk, "post", "/api/admin/academy-calendar/publish");
    assert.match(publish, /isAuthenticated, isAdmin/);
    assert.match(publish, /\.where\(isNull\(academyCalendar\.publishedAt\)\)/);
  });
  it("leaves entries that existed before the column published", () => {
    assert.match(schema, /publishedAt: timestamp\("published_at"\)\.defaultNow\(\)/);
  });
});
