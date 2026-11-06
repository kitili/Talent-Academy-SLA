import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canChangeCalendarEntry, canEditAcademyCalendar } from "../../../shared/academyPeople.ts";
import { TRAINER_TOUR } from "../../../shared/guidedTour.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");
const desk = source("server/academyDesk.ts");
const page = source("client/src/pages/academy-calendar.tsx");
const trainerPage = source("client/src/pages/admin-trainer-detail.tsx");

/** The text of one route: from its `app.<verb>("path"` to the next `app.` call. */
function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

function before(text: string, first: string, second: string) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert.notEqual(a, -1, `${first} is missing`);
  assert.notEqual(b, -1, `${second} is missing`);
  assert.ok(a < b, `${first} must come before ${second}`);
}

describe("canEditAcademyCalendar", () => {
  const table: Array<[string, unknown, boolean]> = [
    ["an Admin", { role: "admin" }, true],
    ["an Admin whose field is off", { role: "admin", canEditCalendar: false }, true],
    ["a Trainer with the right", { role: "trainer", canEditCalendar: true }, true],
    ["a Trainer without it", { role: "trainer", canEditCalendar: false }, false],
    ["a Trainer with the field missing", { role: "trainer" }, false],
    ["a Trainer with the field null", { role: "trainer", canEditCalendar: null }, false],
    ["a Trainer with a truthy string", { role: "trainer", canEditCalendar: "true" }, false],
    ["a Trainer with a truthy number", { role: "trainer", canEditCalendar: 1 }, false],
    ["a Fellow carrying the field", { role: "teacher", canEditCalendar: true }, false],
    ["no role, carrying the field", { canEditCalendar: true }, false],
    ["nobody (null)", null, false],
    ["nobody (undefined)", undefined, false],
  ];
  for (const [who, actor, allowed] of table) {
    it(`${allowed ? "allows" : "refuses"} ${who}`, () => {
      assert.equal(canEditAcademyCalendar(actor as any), allowed);
    });
  }
});

describe("canChangeCalendarEntry", () => {
  const trainer = { id: "t1", role: "trainer", canEditCalendar: true };
  const table: Array<[string, unknown, { createdBy?: string | null }, boolean]> = [
    ["the Admin on anyone's entry", { id: "a1", role: "admin" }, { createdBy: "t1" }, true],
    ["the Admin on an entry with no creator", { id: "a1", role: "admin" }, { createdBy: null }, true],
    ["a Trainer on their own entry", trainer, { createdBy: "t1" }, true],
    ["a Trainer on another Trainer's entry", trainer, { createdBy: "t2" }, false],
    ["a Trainer on an entry with no creator", trainer, { createdBy: null }, false],
    ["a Trainer whose right was taken away, on their own entry", { id: "t1", role: "trainer", canEditCalendar: false }, { createdBy: "t1" }, false],
    ["a Trainer with no id, on an entry with no creator field", { role: "trainer", canEditCalendar: true }, {}, false],
    ["a Fellow carrying the field, on an entry naming them", { id: "f1", role: "teacher", canEditCalendar: true }, { createdBy: "f1" }, false],
    ["nobody", null, { createdBy: "t1" }, false],
  ];
  for (const [who, actor, entry, allowed] of table) {
    it(`${allowed ? "allows" : "refuses"} ${who}`, () => {
      assert.equal(canChangeCalendarEntry(actor as any, entry), allowed);
    });
  }
});

/**
 * Route handlers call `db` directly, so none is driven here. These are text contracts: they prove each rule is written
 * in the route that enforces it. They do not prove what the routes answer at run time.
 */
describe("text contract: calendar writes on the server", () => {
  const add = route(desk, "post", "/api/admin/academy-calendar");
  const edit = route(desk, "patch", "/api/admin/academy-calendar/:id");
  const remove = route(desk, "delete", "/api/admin/academy-calendar/:id");

  it("refuses with 403 anyone the shared rule does not allow", () => {
    assert.match(desk, /const mayEditCalendar: Guard = \(req, res, next\) => \{\s+if \(canEditAcademyCalendar\(req\.user\)\) return next\(\);\s+res\.status\(403\)/);
  });
  it("puts that guard on adding, editing and removing", () => {
    for (const text of [add, edit, remove]) assert.match(text, /isAuthenticated, mayEditCalendar, async/);
  });
  it("publishes a Trainer's entry at once and keeps an Admin's a draft", () => {
    assert.match(add, /const publishedAt = req\.user!\.role === "admin" \? null : new Date\(\)/);
    assert.match(add, /createdBy: req\.user!\.id, publishedAt \}/);
  });
  it("refuses a Trainer on someone else's entry, before anything is written", () => {
    assert.match(edit, /if \(!canChangeCalendarEntry\(req\.user, entry\)\) return res\.status\(403\)/);
    assert.match(remove, /if \(!canChangeCalendarEntry\(req\.user, entry\)\) return res\.status\(403\)/);
    before(edit, "canChangeCalendarEntry(req.user, entry)", "db.update(academyCalendar)");
    before(remove, "canChangeCalendarEntry(req.user, entry)", "db.delete(academyCalendar)");
  });
  it("never lets a body choose who created an entry or when it published", () => {
    assert.match(add, /values\(\{ \.\.\.parsed, createdBy/);
    assert.match(edit, /\.set\(parsed\)/);
    for (const text of [add, edit]) assert.doesNotMatch(text, /req\.body\.(createdBy|publishedAt)|\.\.\.req\.body/);
  });
  it("keeps Done for the Admin alone", () => {
    const done = route(desk, "post", "/api/admin/academy-calendar/publish");
    assert.match(done, /isAuthenticated, isAdmin, async/);
    assert.doesNotMatch(done, /mayEditCalendar/);
  });
});

describe("text contract: granting the right", () => {
  const rights = route(desk, "patch", "/api/admin/trainers/:id/calendar-rights");

  it("is for the Admin alone", () => {
    assert.match(rights, /isAuthenticated, isAdmin, async/);
  });
  it("refuses anything but a boolean", () => {
    assert.match(rights, /typeof canEditCalendar !== "boolean"\) return res\.status\(400\)/);
  });
  it("refuses a target who is not a Trainer, before writing", () => {
    assert.match(rights, /!trainer \|\| trainer\.role !== "trainer"\) return res\.status\(404\)/);
    before(rights, 'trainer.role !== "trainer"', ".update(users)");
  });
  it("writes that one column and sends back no secret", () => {
    assert.match(rights, /\.set\(\{ canEditCalendar \}\)/);
    assert.match(rights, /\.returning\(\{ id: users\.id, canEditCalendar: users\.canEditCalendar \}\)/);
  });
});

describe("text contract: nothing else on the server sets the right", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir))) {
      const path = posix.join(dir, name);
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk("server");

  it("finds the server's files, including the routes", () => {
    assert.ok(files.includes("server/routes.ts"), "server/routes.ts is in the sweep");
    assert.ok(files.includes("server/storage.ts"), "server/storage.ts is in the sweep");
  });
  it("names the column only in the grant route", () => {
    const naming = files.filter((path) => /canEditCalendar|can_edit_calendar/.test(source(path)));
    assert.deepEqual(naming, ["server/academyDesk.ts"]);
    const outside = desk.replace(route(desk, "patch", "/api/admin/trainers/:id/calendar-rights"), "");
    assert.doesNotMatch(outside, /canEditCalendar|can_edit_calendar/);
  });
  it("never writes a request body straight into a person's row", () => {
    const massAssigned = /(?:update\(users\)\s*\.set|insert\(users\)\s*\.values|createUser|updateUser\w*)\(\s*(?:[\w.']+,\s*)?(?:req\.body|\{\s*\.\.\.req\.body)/;
    for (const path of files) assert.doesNotMatch(source(path), massAssigned, path);
  });
});

describe("text contract: the page only hides what the server would refuse", () => {
  it("shows the form for adding to anyone the shared rule allows", () => {
    assert.match(page, /const canEdit = canEditAcademyCalendar\(user\)/);
    assert.match(page, /\{canEdit && \(\s+<form/);
  });
  it("shows Edit and Remove per entry by the shared rule", () => {
    assert.match(page, /\{canChangeCalendarEntry\(user, entry\) && \(\s+<div className="flex gap-2">\s+<button[^\n]*button-year-edit/);
  });
  it("shows Done and the Draft mark to the Admin only", () => {
    assert.match(page, /const isAdmin = user\?\.role === "admin"/);
    assert.match(page, /\{isAdmin && drafts > 0 && \(/);
    assert.match(page, /\{isAdmin && !entry\.publishedAt && \(/);
  });
  it("gives the Admin a switch on the Trainer's page, sending the grant route", () => {
    assert.match(trainerPage, /May add to the academy calendar\s+<Switch\s+checked=\{trainer\.canEditCalendar === true\}/);
    assert.match(trainerPage, /`\/api\/admin\/trainers\/\$\{trainerId\}\/calendar-rights`, \{ canEditCalendar \}/);
  });
});

describe("text contract: the names on the page", () => {
  it("heads the page Calendar / Schedule", () => {
    assert.match(page, /<AcademyShell title="Calendar \/ Schedule"/);
    assert.match(page, /<h1[^>]*>Calendar \/ Schedule<\/h1>/);
  });
  it("names the two tabs Schedule and Academy calendar, on Schedule by default", () => {
    assert.match(page, /<TabsTrigger value="schedule"[^>]*>Schedule<\/TabsTrigger>/);
    assert.match(page, /<TabsTrigger value="year"[^>]*>Academy calendar<\/TabsTrigger>/);
    assert.match(page, /\?\? "schedule";/);
  });
  it("no longer says Timetable or academy year on screen", () => {
    assert.doesNotMatch(page, />Timetable<|>Academy year<|academy year|the timetable/i);
  });
  it("names the menu item in the Trainer's tour", () => {
    const menu = TRAINER_TOUR.find((step) => step.target === "trainer-tools");
    assert.match(menu?.body ?? "", /Calendar \/ Schedule/);
  });
});
