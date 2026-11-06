import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import { attendanceCsv, csvCell, markDateLabel, type AttendanceExportMark } from "../../../shared/attendanceDesk.ts";
import { registerAttendanceExportRoutes } from "../../../server/attendanceExportRoutes.ts";
import { db } from "../../../server/db.ts";
import { storage } from "../../../server/storage.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const mark = (over: Partial<AttendanceExportMark> = {}): AttendanceExportMark => ({
  person: "Amina Otieno",
  role: "teacher",
  type: "in_house",
  cohort: "Cohort A",
  date: "2026-11-03",
  status: "present",
  ...over,
});
/** The rows of a CSV with no comma, quote or line break inside a cell. */
const cells = (csv: string) => csv.replace(/^﻿/, "").split("\r\n").map((line) => line.slice(1, -1).split('","'));

describe("attendance CSV rows", () => {
  it("is the header alone when nobody has a mark", () => {
    assert.equal(attendanceCsv([]), '﻿"person","kind","cohort","date","status"');
  });

  it("writes one row per mark: the kind in words, the date as the screen prints it, the status as a label", () => {
    const [, row] = cells(attendanceCsv([mark()]));
    assert.deepEqual(row, ["Amina Otieno", "In-house Fellow", "Cohort A", "3 Nov 2026", "Present"]);
    assert.equal(markDateLabel("2026-11-03"), markDateLabel("2026-11-03T00:00:00.000Z"));
  });

  it("names each kind of person, so the Admin can filter Fellows from Trainers", () => {
    const kinds = cells(
      attendanceCsv([
        mark({ type: "pre_service" }),
        mark({ type: null }),
        mark({ role: "trainer", type: "instructional" }),
        mark({ role: "trainer", type: "in_house" }),
      ]),
    ).slice(1).map((row) => row[1]);
    assert.deepEqual(kinds.sort(), ["In-house Fellow", "In-house Trainer", "Instructional Trainer", "Pre-service Fellow"]);
  });

  it("puts the newest mark first, then cohort, then person", () => {
    const people = cells(
      attendanceCsv([
        mark({ person: "Old", date: "2026-10-01" }),
        mark({ person: "Zed", date: "2026-11-03" }),
        mark({ person: "Bea", date: "2026-11-03" }),
        mark({ person: "Other cohort", date: "2026-11-03", cohort: "Cohort B" }),
      ]),
    ).slice(1).map((row) => row[0]);
    assert.deepEqual(people, ["Bea", "Zed", "Other cohort", "Old"]);
  });

  it("quotes commas, doubles quotes and keeps a line break inside its cell", () => {
    assert.equal(csvCell('Otieno, Amina "Mina"'), '"Otieno, Amina ""Mina"""');
    assert.equal(csvCell("two\nlines"), '"two\nlines"');
    assert.ok(attendanceCsv([mark({ person: 'A, "B"' })]).includes('"A, ""B""","In-house Fellow"'));
  });

  it("keeps a name's letters, with the byte order mark Excel needs to read them", () => {
    const csv = attendanceCsv([mark({ person: "Wanjirũ" })]);
    assert.ok(csv.startsWith("﻿"));
    assert.ok(csv.includes('"Wanjirũ"'));
  });

  it("prefixes a value a spreadsheet would run, and leaves ordinary values alone", () => {
    for (const value of ["=1+1", "+254700", "-2+3", "@SUM(A1)", "\t=1+1", "\r=1+1", "  =1+1", "=HYPERLINK(\"http://x\")"]) {
      assert.ok(csvCell(value).startsWith(`"'`), `${JSON.stringify(value)} must open as text`);
    }
    for (const value of ["Amina", "O'Brien", "Mary-Jane", "a=b", "3 Nov 2026", ""]) {
      assert.ok(!csvCell(value).startsWith(`"'`), `${JSON.stringify(value)} must stay as it is`);
    }
  });

  it("guards every column, because Trainers name cohorts and the bulk mark route takes any status", () => {
    const [, row] = cells(attendanceCsv([mark({ person: "=p()", cohort: "@c()", status: "-s()" })]));
    assert.equal(row[0], "'=p()");
    assert.equal(row[2], "'@c()");
    assert.equal(row[4], "'-s()");
  });
});

describe("attendance export routes", () => {
  type Handler = (req: any, res: any, next: () => void) => unknown;
  const routes = new Map<string, Handler[]>();
  const refuse = (res: any, code: number) => res.status(code).json({ error: "refused" });
  // The same checks as isAuthenticated, isTrainer and isAdmin in server/routes.ts; a text contract below pins those.
  registerAttendanceExportRoutes(
    { get: (path: string, ...handlers: Handler[]) => routes.set(path, handlers) } as any,
    {
      isAuthenticated: (req: any, res: any, next: () => void) => (req.user ? next() : refuse(res, 401)),
      isTrainer: (req: any, res: any, next: () => void) => (["admin", "trainer"].includes(req.user?.role) ? next() : refuse(res, 403)),
      isAdmin: (req: any, res: any, next: () => void) => (req.user?.role === "admin" ? next() : refuse(res, 403)),
    } as any,
  );

  /** Runs a route's real guards and handler. The database is stubbed: no test here opens a connection. */
  async function call(path: string, user: unknown, params: Record<string, string> = {}) {
    const answer: { code: number; body?: unknown; headers: Record<string, string> } = { code: 200, headers: {} };
    const res = {
      setHeader: (name: string, value: string) => { answer.headers[name] = value; },
      status: (code: number) => { answer.code = code; return res; },
      json: (body: unknown) => { answer.body = body; return res; },
      send: (body: unknown) => { answer.body = body; return res; },
    };
    const req = { user, params };
    for (const handler of routes.get(path)!) {
      let moved = false;
      await handler(req, res, () => { moved = true; });
      if (!moved) break;
    }
    return answer;
  }

  const COHORT = "/api/batches/:batchId/attendance.csv";
  const ACADEMY = "/api/admin/attendance.csv";
  const batch = { id: "b1", name: "Cohort 7: Nairobi!", trainerId: "lead", trainerIds: ["second"] };
  const row = { person: "Amina", type: "pre_service", cohort: "Cohort 7", date: "2026-11-03", status: "late" };
  const queries: { sql: string; params: unknown[] }[] = [];

  function stubDatabase(getBatch: () => unknown = () => batch) {
    queries.length = 0;
    mock.method(storage, "getBatch", async () => getBatch());
    mock.method(db, "execute", async (query: any) => {
      queries.push(new PgDialect().sqlToQuery(query));
      return { rows: [row] };
    });
  }

  afterEach(() => mock.restoreAll());

  it("lets the Admin and each Trainer of the cohort download it, as Fellows only", async () => {
    stubDatabase();
    for (const user of [{ id: "boss", role: "admin" }, { id: "lead", role: "trainer" }, { id: "second", role: "trainer" }]) {
      queries.length = 0;
      const answer = await call(COHORT, user, { batchId: "b1" });
      assert.equal(answer.code, 200);
      assert.equal(answer.headers["Content-Type"], "text/csv; charset=utf-8");
      assert.equal(answer.headers["Content-Disposition"], 'attachment; filename="attendance-cohort-7-nairobi.csv"');
      assert.ok(String(answer.body).includes('"Amina","Pre-service Fellow","Cohort 7","3 Nov 2026","Late"'));
      assert.equal(queries.length, 1);
      assert.match(queries[0].sql, /attendance_records/);
      assert.match(queries[0].sql, /a\.batch_id = \$1/);
      assert.deepEqual(queries[0].params, ["b1"]);
    }
  });

  it("refuses a Trainer outside the cohort, and reads no marks for them", async () => {
    stubDatabase();
    const answer = await call(COHORT, { id: "outsider", role: "trainer" }, { batchId: "b1" });
    assert.equal(answer.code, 403);
    assert.equal(queries.length, 0);
  });

  it("does not treat a cohort that is not found as open to any Trainer", async () => {
    stubDatabase(() => undefined);
    const answer = await call(COHORT, { id: "lead", role: "trainer" }, { batchId: "nope" });
    assert.equal(answer.code, 404);
    assert.equal(queries.length, 0);
  });

  it("refuses a Fellow and anyone signed out on both exports", async () => {
    stubDatabase();
    for (const path of [COHORT, ACADEMY]) {
      assert.equal((await call(path, undefined, { batchId: "b1" })).code, 401);
      assert.equal((await call(path, { id: "f1", role: "teacher" }, { batchId: "b1" })).code, 403);
    }
    assert.equal(queries.length, 0);
  });

  it("gives the academy export to the Admin alone, with Fellows and Trainers and no cohort filter", async () => {
    stubDatabase();
    const trainer = await call(ACADEMY, { id: "lead", role: "trainer" });
    assert.equal(trainer.code, 403);
    assert.equal(queries.length, 0);

    const admin = await call(ACADEMY, { id: "boss", role: "admin" });
    assert.equal(admin.code, 200);
    assert.equal(admin.headers["Content-Disposition"], 'attachment; filename="attendance.csv"');
    assert.deepEqual(queries.map((query) => /trainer_attendance/.test(query.sql)).sort(), [false, true]);
    assert.ok(queries.every((query) => query.params.length === 0));
  });

  it("reads each date off the column, so no time zone can move it, and leaves removed people out", () => {
    const module = source("server/attendanceExportRoutes.ts");
    assert.equal(module.match(/to_char\(a\.date, 'YYYY-MM-DD'\)/g)?.length, 2);
    assert.equal(module.match(/approval_status, 'approved'\) <> 'inactive'/g)?.length, 2);
  });
});

/**
 * Text contracts: they read the source and prove each rule is written where it is enforced. There is no component
 * test set-up here, and `isAdmin` and `isTrainer` are private to server/routes.ts. Nothing below runs a browser.
 */
describe("attendance export wiring (text contracts)", () => {
  const routesFile = source("server/routes.ts");
  const module = source("server/attendanceExportRoutes.ts");
  const board = source("client/src/components/AttendanceBoard.tsx");
  const page = source("client/src/pages/admin-attendance.tsx");

  it("names the guards each route runs behind", () => {
    assert.match(module, /app\.get\("\/api\/batches\/:batchId\/attendance\.csv", isAuthenticated, isTrainer,/);
    assert.match(module, /trainerOwnsBatch\(req\.user, batch\)\) return res\.status\(403\)/);
    assert.match(module, /app\.get\("\/api\/admin\/attendance\.csv", isAuthenticated, isAdmin,/);
  });

  it("registers the module with the guards the test above copies", () => {
    assert.match(routesFile, /registerAttendanceExportRoutes\(app, guards\)/);
    assert.match(routesFile, /function isAdmin\([^)]*\) \{\r?\n\s*if \(req\.user && req\.user\.role === "admin"\)/);
    assert.match(routesFile, /function isTrainer\([^)]*\) \{\r?\n\s*if \(req\.user && \(req\.user\.role === "admin" \|\| req\.user\.role === "trainer"\)\)/);
  });

  it("offers a real download link and the browser's print, with no PDF library", () => {
    assert.match(board, /export function AttendanceExportButtons\(\{ csvHref \}: \{ csvHref: string \}\)/);
    assert.match(board, /<a href=\{csvHref\} download [^>]*>Download CSV<\/a>/);
    assert.match(board, /onClick=\{printAttendance\}[^>]*>Download PDF<\/button>/);
    assert.match(board, /function printAttendance\(\) \{[\s\S]*?window\.print\(\);\r?\n\}/);
    assert.doesNotMatch(board + page, /jspdf|html2pdf|pdf-lib|pdfkit/i);
  });

  it("keeps the buttons and the marking form off the paper, and the figures where they are", () => {
    assert.match(board, /flex flex-wrap gap-2 print:hidden" data-testid="attendance-export"/);
    assert.match(page, /<AttendanceExportButtons csvHref="\/api\/admin\/attendance\.csv" \/>/);
    assert.match(page, /aria-labelledby="attendance-mark" className="[^"]*print:hidden"/);
    const recent = page.indexOf('aria-labelledby="attendance-recent"');
    const figures = page.indexOf("<AttendanceBoard />");
    assert.ok(recent > 0 && figures > recent, "the attendance figures stay at the bottom of the page");
    assert.match(page.slice(figures), /^<AttendanceBoard \/>\r?\n\s*<\/div>\r?\n\s*<\/AcademyShell>/);
  });

  it("relies on the shell hiding its own header and menus on paper", () => {
    const shell = source("client/src/components/AcademyShell.tsx");
    assert.match(shell, /<header className="[^"]*print:hidden/);
    assert.match(shell, /data-testid=\{desk === "admin" \? "admin-nav" : `nav-\$\{desk\}`\}\r?\n\s*className="[^"]*print:hidden/);
    assert.match(shell, /data-testid=\{`phone-nav-\$\{desk\}`\}\r?\n\s*className="[^"]*print:hidden/);
    assert.match(shell, /h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible/);
  });

  it("prints a mark's date through the one function the CSV uses", () => {
    assert.match(page, /\{markDateLabel\(row\.date\)\}/);
    assert.equal(page.includes("toLocaleDateString(\"en-GB\", { day: \"numeric\", month: \"short\""), false);
  });
});
