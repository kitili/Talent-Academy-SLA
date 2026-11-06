import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dayLabel, minuteOptions, parseDayValue, parseTimeValue } from "../../../client/src/components/DateField.tsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** These are TEXT CONTRACTS: they read the component source, because a layout cannot be rendered under node:test. */
describe("the month grid cannot be distorted (text contract)", () => {
  const grid = read("client/src/components/MonthCalendar.tsx");

  it("draws seven equal columns of minmax(0,1fr) in a CSS grid, never a table", () => {
    const columns = grid.match(/grid-cols-\[repeat\(7,minmax\(0,1fr\)\)\]/g) ?? [];
    assert.ok(columns.length >= 2, "the day grid and its weekday row both use seven minmax(0,1fr) columns");
    assert.equal(/<table|<tr[ >]|<td[ >]/.test(grid), false, "no HTML table");
  });

  it("lets every cell and chip shrink and cut long text", () => {
    assert.match(grid, /className=\{`flex min-h-12 min-w-0 flex-col[^`]*overflow-hidden/, "the day cell has min-w-0 and clips");
    assert.match(grid, /block min-w-0 truncate rounded px-1\.5/, "a chip has min-w-0 and truncate");
    assert.match(grid, /min-w-0 truncate rounded px-2 py-1/, "a running-strip line has min-w-0 and truncate");
  });

  it("gives every day the same minimum height", () => {
    assert.match(grid, /min-h-12[^`]*sm:min-h-\[5\.5rem\]/);
  });

  it("shows three chips then +N more, and a dot below sm instead of text", () => {
    assert.match(grid, /\+\{day\.more\} more/);
    assert.match(grid, /h-1\.5 w-1\.5 shrink-0 rounded-full bg-sl-accent sm:hidden/);
    assert.match(grid, /hidden min-w-0 flex-col gap-0\.5 sm:flex/);
  });

  it("marks today with aria-current and names each day for a screen reader", () => {
    assert.match(grid, /aria-current=\{today \? "date" : undefined\}/);
    assert.match(grid, /aria-label=\{`\$\{longDay\(day\.key\)\}, /);
    assert.match(grid, /<button\r?\n\s+key=\{day\.key\}/, "a day is a real button");
  });

  it("uses only sl-* colour tokens, no green and no raw hex", () => {
    for (const file of ["client/src/components/MonthCalendar.tsx", "client/src/components/DateField.tsx", "client/src/components/ui/calendar.tsx"]) {
      const text = read(file);
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(text), false, `${file} has a raw hex colour`);
      assert.equal(/\b(?:bg|text|border|ring|outline)-(?:green|emerald|lime|teal)\b/.test(text), false, `${file} uses green`);
      assert.equal(/\b(?:bg|text|border|ring)-(?:primary|accent|muted|popover|background)\b/.test(text), false, `${file} uses a shadcn colour instead of an sl-* token`);
    }
  });
});

describe("both calendar tabs and the cohort room use the one month component", () => {
  it("academy-calendar.tsx and cohort-workspace.tsx render MonthCalendar", () => {
    assert.match(read("client/src/pages/academy-calendar.tsx"), /<MonthCalendar[\s\S]*basis|<MonthCalendar/);
    assert.equal((read("client/src/pages/academy-calendar.tsx").match(/<MonthCalendar/g) ?? []).length, 2);
    assert.match(read("client/src/pages/cohort-workspace.tsx"), /<MonthCalendar/);
  });

  it("says which clock reads each row: whole days in UTC, sessions on the viewer's day", () => {
    const page = read("client/src/pages/academy-calendar.tsx");
    assert.match(page, /basis: "utc-day" as const/);
    assert.match(page, /basis: "local-instant" as const/);
    assert.match(read("client/src/pages/cohort-workspace.tsx"), /basis: "local-instant" as const/);
  });

  it("defaults both tabs to Month and keeps List", () => {
    const page = read("client/src/pages/academy-calendar.tsx");
    assert.equal((page.match(/useState<View>\("month"\)/g) ?? []).length, 2);
    assert.match(page, /option\("list", "List"\)/);
  });

  it("turns the past-sessions query on when the viewer pages to an earlier month", () => {
    const page = read("client/src/pages/academy-calendar.tsx");
    assert.match(page, /const wantPast = showPast \|\| viewingEarlier;/);
    assert.match(page, /enabled: wantPast,/);
  });

  it("sends the cohort room's session as an instant, not as a zoneless string", () => {
    assert.match(read("client/src/pages/cohort-workspace.tsx"), /startDate: new Date\(eventStart\)\.toISOString\(\)/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe("no native date input is left (text contract)", () => {
  it("no client/src file draws type=\"date\" or type=\"datetime-local\" outside the field component", () => {
    const offenders = sourceFiles(join(root, "client", "src"))
      .filter((file) => !/[\\/]components[\\/]DateField\.tsx$/.test(file))
      .filter((file) => /type=(?:"|'|\{["'`])(?:date|datetime-local|time|month|week)(?:"|'|["'`]\})/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    assert.deepEqual(offenders, []);
  });

  it("every former call site now imports DateField or DateTimeField", () => {
    for (const file of [
      "client/src/components/ProfileSettingsDialog.tsx",
      "client/src/components/ReopenDialog.tsx",
      "client/src/components/SessionDialog.tsx",
      "client/src/pages/academy-calendar.tsx",
      "client/src/pages/admin-attendance.tsx",
      "client/src/pages/cohort-workspace.tsx",
      "client/src/pages/teacher-dashboard.tsx",
      "client/src/pages/trainer-batches.tsx",
    ]) {
      assert.match(read(file), /from "@\/components\/DateField"/, file);
    }
  });

  it("keeps the min, max and required rules the native inputs had", () => {
    assert.match(read("client/src/pages/academy-calendar.tsx"), /<DateField id="year-start"[^\n]*required/);
    assert.match(read("client/src/pages/academy-calendar.tsx"), /<DateField id="year-end" value=\{form\.endDate\} min=\{form\.startDate \|\| undefined\}/);
    assert.match(read("client/src/pages/trainer-batches.tsx"), /id="attendance-date"[\s\S]{0,200}max=\{todayValue\}/);
  });
});

describe("DateField strings (the same strings the native inputs gave)", () => {
  it("reads YYYY-MM-DD as that local day and refuses what is not a day", () => {
    const day = parseDayValue("2027-05-03")!;
    assert.deepEqual([day.getFullYear(), day.getMonth(), day.getDate()], [2027, 4, 3]);
    assert.equal(parseDayValue("2027-02-30"), undefined);
    assert.equal(parseDayValue(""), undefined);
    assert.equal(parseDayValue("not a date"), undefined);
    assert.equal(parseDayValue("2027-05-03T09:30")!.getDate(), 3, "the day part of a date and time");
  });

  it("labels a day like 3 May 2027", () => {
    assert.equal(dayLabel(parseDayValue("2027-05-03")!), "3 May 2027");
  });

  it("reads the time of a date and time, with a default", () => {
    assert.equal(parseTimeValue("2027-05-03T14:05"), "14:05");
    assert.equal(parseTimeValue(""), "09:00");
  });

  it("offers 5-minute steps and keeps an existing minute that is off the step", () => {
    assert.deepEqual(minuteOptions("30").slice(0, 3), ["00", "05", "10"]);
    assert.equal(minuteOptions("30").length, 12);
    assert.equal(minuteOptions("07").includes("07"), true);
    assert.equal(minuteOptions("07").length, 13);
  });
});
