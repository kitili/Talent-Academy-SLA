import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FELLOW_TABS,
  assessmentGroup,
  courseProgressRows,
  fellowDeskRedirect,
  safeFileHref,
  sortAssessments,
  tabFromUrl,
} from "../../../client/src/lib/fellowDesk.ts";

/** The pure rules of the Fellow desk (client/src/lib/fellowDesk.ts), which teacher-dashboard.tsx and teacher-exam.tsx import. */

describe("which section a link opens", () => {
  it("opens Assessments for the old Work and Quizzes links, and an old #my-work", () => {
    assert.equal(tabFromUrl("?tab=work", ""), "assessments");
    assert.equal(tabFromUrl("?tab=quizzes", ""), "assessments");
    assert.equal(tabFromUrl("?tab=quiz", ""), "assessments");
    assert.equal(tabFromUrl("", "#my-work"), "assessments");
    assert.equal(tabFromUrl("?tab=assessments", ""), "assessments");
  });

  it("keeps every other section, #my-learning, and falls back to Home", () => {
    for (const tab of FELLOW_TABS) assert.equal(tabFromUrl(`?tab=${tab}`, ""), tab);
    assert.equal(tabFromUrl("", "#my-learning"), "learning");
    assert.equal(tabFromUrl("?tab=unknown", ""), "home");
    assert.equal(tabFromUrl("", ""), "home");
  });

  it("has no Work or Quizzes section of its own", () => {
    assert.deepEqual([...FELLOW_TABS], ["home", "learning", "assessments", "progress", "reflect", "messages"]);
  });

  it("sends the old calendar anchor to the Calendar page", () => {
    assert.equal(fellowDeskRedirect("#my-calendar"), "/calendar");
    assert.equal(fellowDeskRedirect("#my-work"), null);
    assert.equal(fellowDeskRedirect(""), null);
  });
});

describe("a stored file or link is clickable only if it is https or a path on this site", () => {
  it("allows https and site paths", () => {
    assert.equal(safeFileHref("https://example.org/a.pdf"), "https://example.org/a.pdf");
    assert.equal(safeFileHref("HTTPS://example.org/a"), "HTTPS://example.org/a");
    assert.equal(safeFileHref("/api/files/abc"), "/api/files/abc");
    assert.equal(safeFileHref("  https://example.org/a  "), "https://example.org/a");
  });

  it("refuses javascript:, data:, http:, protocol-relative, relative and empty values", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "http://example.org/a", "//evil.example/a", "/\\evil.example", "files/a.pdf", "", "https://", "https://a b", null, undefined, 5]) {
      assert.equal(safeFileHref(bad), null, String(bad));
    }
  });
});

describe("the Assessments order puts what needs doing first", () => {
  const row = (title: string, due: string | null, closed = false, done = false) => ({ title, due, closed, done });

  it("groups a closed item as closed even when it was tried, and a finished one as handed in", () => {
    assert.equal(assessmentGroup({ closed: false, done: false }), 0);
    assert.equal(assessmentGroup({ closed: false, done: true }), 1);
    assert.equal(assessmentGroup({ closed: true, done: false }), 2);
    assert.equal(assessmentGroup({ closed: true, done: true }), 2);
  });

  it("lists to do (soonest first, no deadline last), then handed in, then closed (latest first)", () => {
    const sorted = sortAssessments([
      row("closed old", "2026-01-01T00:00:00Z", true),
      row("done", "2026-12-01T00:00:00Z", false, true),
      row("later", "2026-12-20T00:00:00Z"),
      row("closed new", "2026-02-01T00:00:00Z", true, true),
      row("never due", null),
      row("soon", "2026-11-10T00:00:00Z"),
    ]);
    assert.deepEqual(sorted.map((entry) => entry.title), ["soon", "later", "never due", "done", "closed new", "closed old"]);
  });

  it("does not change the list it is given", () => {
    const input = [row("b", null, true), row("a", null)];
    sortAssessments(input);
    assert.equal(input[0].title, "b");
  });
});

describe("the progress chart's rows", () => {
  it("keeps each course's name and a whole percent between 0 and 100", () => {
    assert.deepEqual(
      courseProgressRows([{ name: "A", pct: 33.4 }, { name: "B", pct: 140 }, { name: "C", pct: -5 }, { name: "D", pct: Number.NaN }]),
      [{ name: "A", percent: 33 }, { name: "B", percent: 100 }, { name: "C", percent: 0 }, { name: "D", percent: 0 }],
    );
  });
});
