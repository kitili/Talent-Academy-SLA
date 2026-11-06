import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { noticeHref } from "../../../client/src/components/NotificationBell.tsx";

/** Item 18: a notice names something, says it in the desk's words, and a click takes the reader to it. */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");
const bell = source("client/src/components/NotificationBell.tsx");

/**
 * The words of every notice written where it is sent, found rather than listed, so a notice added later is covered.
 * A call runs to the first `;` at the end of a line, and `${…}` is dropped, so a value's name is not read as copy.
 */
function noticeCalls(text: string) {
  const calls: string[] = [];
  const pattern = /\b(?:notifyTeacher|notifyBatchTeachers|notifyQuizTeachers|storage\.createNotification|store\.notify|deps\.notify)\(/g;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    if (/(?:async function |export async function )$/.test(before)) continue;
    const end = text.indexOf(";\n", match.index);
    calls.push(text.slice(match.index, end === -1 ? undefined : end));
  }
  return calls;
}

function wordsOf(call: string) {
  // `recipientType: "teacher"` is the row's key, not something the reader sees.
  const shown = call.replace(/recipientType: "[^"]*"/g, " ");
  const literals = shown.match(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  return literals.map((literal) => literal.replace(/\$\{[^}]*\}/g, " ")).join(" ");
}

describe("where a click goes", () => {
  const fellow = (type: string, metadata: Record<string, unknown> | null) => noticeHref({ recipientType: "teacher", type, metadata });

  it("desk mail opens Messages on the reader's own desk", () => {
    const metadata = { fromId: "x", fromRole: "teacher" };
    assert.equal(noticeHref({ recipientType: "teacher", type: "general", metadata }), "/teacher/dashboard?tab=messages");
    assert.equal(noticeHref({ recipientType: "trainer", type: "general", metadata }), "/trainer/batches?tab=messages");
    assert.equal(noticeHref({ recipientType: "admin", type: "general", metadata }), "/admin/messages");
  });

  it("a Fellow's work, sessions, materials and new cohort each open their page", () => {
    assert.equal(fellow("deadline", { batchId: "c" }), "/teacher/dashboard?tab=assessments");
    assert.equal(fellow("general", { batchId: "c", assignmentId: "a" }), "/teacher/dashboard?tab=assessments");
    assert.equal(fellow("session_reminder", { batchId: "c" }), "/calendar");
    assert.equal(fellow("general", { batchId: "c", materialId: "m" }), "/teacher/dashboard?tab=learning");
    assert.equal(fellow("general", { batchId: "c", opens: "learning" }), "/teacher/dashboard?tab=learning");
  });

  it("a notice that is its own message opens nothing, on any desk", () => {
    assert.equal(fellow("general", { batchId: "c" }), null);
    assert.equal(fellow("general", { academy: true }), null);
    assert.equal(fellow("general", null), null);
    assert.equal(noticeHref({ recipientType: "trainer", type: "general", metadata: { academy: true } }), null);
    assert.equal(noticeHref({ recipientType: "trainer", type: "deadline", metadata: {} }), null, "a Trainer has no Fellow page to open");
  });

  it("every place it sends someone is a page, or a tab the desk's menu lists", () => {
    const app = source("client/src/App.tsx");
    for (const path of ["/admin/messages", "/calendar", "/teacher/dashboard", "/trainer/batches"]) {
      assert.ok(app.includes(`path="${path}"`), path);
    }
    const menu = source("client/src/components/deskMenu.ts");
    assert.match(menu, /\/trainer\/batches\?tab=messages/);
    assert.match(menu, /\/teacher\/dashboard\?tab=messages/);
    assert.match(menu, /\/teacher\/dashboard\?tab=learning/);
  });

  it("a click marks the notice read and follows it, and the row is a button the keyboard can reach", () => {
    assert.match(bell, /onClick=\{\(\) => followNotice\(n\)\}/);
    assert.match(bell, /if \(notice\.isRead === "no"\) markReadMutation\.mutate\(notice\.id\);/);
    assert.match(bell, /setLocation\(href\)/);
    assert.match(bell, /<button\s+type="button"\s+key=\{n\.id\}/);
  });
});

describe("what the bell shows", () => {
  it("never prints a stored type: `session_reminder` is code, not a word", () => {
    assert.doesNotMatch(bell, /\{n\.type\}/);
    assert.match(bell, /session_reminder: "Session"/);
  });

  it("shows the whole notice, because an academy notice has nowhere else to be read", () => {
    assert.doesNotMatch(bell, /line-clamp/);
    assert.doesNotMatch(bell, /truncate/);
  });
});

describe("what a notice says", () => {
  for (const path of ["server/routes.ts", "server/deadlineRoutes.ts", "server/materialRoutes.ts"]) {
    it(`${path}: no notice names a code word`, () => {
      const calls = noticeCalls(source(path));
      assert.ok(calls.length > 0, "found no notices, so this test would pass for nothing");
      for (const call of calls) {
        assert.doesNotMatch(wordsOf(call), /\b(?:teachers?|batch(?:es)?|dashboard)\b/i, call.slice(0, 200));
      }
    });
  }

  it("finds the notices it claims to: every site in the routes file", () => {
    assert.ok(noticeCalls(routes).length >= 18, `found ${noticeCalls(routes).length}`);
  });

  it("points at the Fellow's menu as it now reads", () => {
    assert.doesNotMatch(routes, /Open your exams/);
    assert.doesNotMatch(routes, /Open Work on/);
    assert.doesNotMatch(routes, /Open your dashboard/);
  });

  it("a Fellow who joins a cohort gets one wording, from all three routes", () => {
    assert.equal(routes.split('"You\'re in"').length - 1, 1);
    for (const [verb, path] of [
      ["post", "/api/batches/:batchId/teachers"],
      ["post", "/api/batches/:batchId/teachers/bulk"],
      ["post", "/api/batches/:batchId/teachers/import-csv"],
    ]) {
      const start = routes.indexOf(`app.${verb}("${path}"`);
      assert.notEqual(start, -1, path);
      const text = routes.slice(start, routes.indexOf("\n  app.", start + 10));
      assert.match(text, /noticeFellowJoined\(/, path);
    }
  });

  it("a marked piece of work says which work", () => {
    const start = routes.indexOf('"Written work marked"');
    assert.match(routes.slice(start, start + 200), /\$\{assignment\.title\} was marked/);
  });

  it("a star comes from a person, not a login", () => {
    assert.doesNotMatch(routes, /req\.user!\.username \|\| "Your trainer"/);
    assert.match(routes, /\$\{deskName\(req\.user!\)\} gave you a star/);
  });
});

describe("removed, and why", () => {
  it("a Fellow is not told they failed the quiz they just failed: the screen says so, with the tries left", () => {
    assert.doesNotMatch(routes, /Quiz needs another try/);
    assert.doesNotMatch(routes, /failCount/);
    assert.match(source("client/src/components/QuizRunner.tsx"), /result\.remainingAttempts/);
  });
});
