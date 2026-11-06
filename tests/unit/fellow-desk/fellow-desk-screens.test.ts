import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DESK_MENUS, DESK_PHONE_BAR } from "../../../client/src/components/deskMenu.ts";
import { TEACHER_TOUR } from "../../../shared/guidedTour.ts";

/**
 * TEXT CONTRACTS: these read the Fellow screens as source text, because no test here renders a page. They pin the
 * promises the screens make (no way to submit a closed item, no raw stored link in an href, the old links still land),
 * so removing one of those lines turns a test red. They do not prove the page looks right: that is the browser run.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const dashboard = source("client/src/pages/teacher-dashboard.tsx");
const exam = source("client/src/pages/teacher-exam.tsx");

function clientFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? clientFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the Fellow menu and tour", () => {
  it("has one Assessments item in place of Work and Quizzes, and the phone bar names it", () => {
    const fellow = DESK_MENUS.fellow;
    assert.deepEqual(fellow.map((item) => item.label), ["Home", "Learning", "Assessments", "Progress", "Reflect", "Messages", "Calendar / Schedule", "Certificates"]);
    assert.equal(fellow.find((item) => item.key === "assessments")?.href, "/teacher/dashboard?tab=assessments");
    assert.deepEqual([...DESK_PHONE_BAR.fellow], ["home", "learning", "assessments", "messages"]);
  });

  it("does not send the Fellow to a Work page the desk no longer has", () => {
    assert.ok(!TEACHER_TOUR.some((step) => /on Work\b|Quizzes tab/.test(step.body)));
    assert.ok(TEACHER_TOUR.some((step) => /Assessments/.test(step.body)));
  });

  it("is linked to as Assessments everywhere in the client; no link still asks for ?tab=work or ?tab=quizzes", () => {
    for (const file of clientFiles(join(root, "client", "src"))) {
      const text = readFileSync(file, "utf8");
      // trainer-batches and cohort-workspace use their own `?tab=work` (a cohort's marking tab), not the Fellow desk's.
      if (/cohort-workspace|trainer-batches/.test(file)) continue;
      assert.doesNotMatch(text, /teacher\/dashboard\?tab=(work|quizzes)/, file);
      assert.doesNotMatch(text, /href="\?tab=(work|quizzes)/, file);
    }
  });
});

describe("a closed item stays visible but cannot be sat or handed in", () => {
  it("reads the server's `closed`, not the clock, and no longer imports the old list rule", () => {
    assert.doesNotMatch(dashboard, /fellowStillSees|isPastDue/);
    assert.doesNotMatch(exam, /fellowStillSees|isPastDue/);
    assert.match(dashboard, /closed: Boolean\(exam\.closed\)/);
    assert.match(dashboard, /closed: Boolean\(item\.closed\)/);
    assert.match(exam, /const closed = Boolean\(quiz\?\.closed\)/);
  });

  it("gives a closed exam nobody tried no button, and a closed piece of work nobody handed in no form", () => {
    assert.match(dashboard, /const canOpen = !row\.closed \|\| standing\.tries > 0;/);
    assert.match(dashboard, /\{canOpen && \(\n\s+<button/);
    assert.match(dashboard, /\) : row\.closed \? \(\n\s+<p className="text-sm text-sl-muted">This work is closed/);
    assert.match(dashboard, /<Chip[^>]*>Closed<\/Chip>/);
  });

  it("keeps Home's To do to open work only, using the same ordering as Assessments", () => {
    assert.match(dashboard, /const toDo = assessmentRows\.filter\(\(row\) => assessmentGroup\(row\) === 0\);/);
    assert.match(dashboard, /const nextExam = toDo\.find/);
  });

  it("stops the exam page sending answers or starting a try once closed, and says plainly when it is closed", () => {
    assert.match(exam, /mine\.length >= QUIZ_ATTEMPTS \|\| closed\}/);
    assert.match(exam, /\(\(!finished && !closed\) \|\| triedHere\)/);
    assert.match(exam, /startsWith\("410"\)/);
    assert.match(exam, /This exam is closed: its deadline has passed\./);
    assert.match(exam, /current="assessments"/);
    assert.match(exam, /\/teacher\/dashboard\?tab=assessments/);
  });
});

describe("a stored link is rendered only through safeFileHref", () => {
  it("passes the work file and each material file and link through it, and never puts a raw value in an href", () => {
    assert.match(dashboard, /const fileUrl = safeFileHref\(item\.file_url \|\| item\.fileUrl\)/);
    assert.match(dashboard, /const file = safeFileHref\(material\.fileUrl\)/);
    assert.match(dashboard, /const link = safeFileHref\(material\.linkUrl\)/);
    assert.doesNotMatch(dashboard, /href=\{(material\.fileUrl|material\.linkUrl|item\.file_url|item\.fileUrl)\}/);
    assert.doesNotMatch(exam, /href=\{quiz\??\.paperUrl\}/);
  });
});

describe("the Fellow's Learning, Messages, Progress and Home", () => {
  it("shows Materials from the Fellow's own route, and hides the panel when there are none", () => {
    assert.match(dashboard, /queryKey: \["\/api\/teacher\/materials"\]/);
    assert.match(dashboard, /\{materials\.length > 0 && \(\n\s+<Panel title="Materials"/);
  });

  it("lists Admins who wrote to the Fellow as threads and gives DeskMail a key per person", () => {
    assert.match(dashboard, /queryKey: \["\/api\/teacher\/admin-threads"\]/);
    assert.match(dashboard, /role: "admin" as string/);
    assert.match(dashboard, /<DeskMail key=\{activePeer\?\.id \|\| "none"\}/);
  });

  it("puts desk mail before feedback and notices, and shows those only when they have something", () => {
    assert.ok(dashboard.indexOf('<Panel title="Desk mail"') < dashboard.indexOf('<Panel title="Trainer feedback"'));
    assert.ok(dashboard.indexOf('<Panel title="Trainer feedback"') < dashboard.indexOf('<Panel title="From the academy"'));
    assert.match(dashboard, /\{\(commentsLoading \|\| trainerComments\.length > 0\) && \(/);
    assert.match(dashboard, /\{\(noticesLoading \|\| deskNotices\.length > 0\) && \(/);
  });

  it("draws the progress chart above the cohort details, from the theme's chart colour and never green", () => {
    assert.ok(dashboard.indexOf("<CourseProgressChart") < dashboard.indexOf("card-teacher-medals"));
    const chart = source("client/src/components/CourseProgressChart.tsx");
    assert.match(chart, /hsl\(var\(--chart-1\)\)/);
    assert.doesNotMatch(chart, /green|#[0-9a-fA-F]{3,6}\b/i);
    assert.match(chart, /<table/);
  });

  it("places the photo, the line for the day and the kind badge on Home, with To do before the courses", () => {
    assert.match(dashboard, /<DeskPhoto desk="fellow" \/>/);
    assert.match(dashboard, /<DailyLine \/>/);
    assert.match(dashboard, /<KindBadge \/>/);
    assert.ok(dashboard.indexOf('title="To do"') < dashboard.indexOf("Your courses in Step"));
  });

  it("sends the calendar links to the Calendar page and has no calendar panel of its own", () => {
    assert.doesNotMatch(dashboard, /id="my-calendar"/);
    assert.match(dashboard, /setLocation\("\/calendar"\)/);
  });
});
