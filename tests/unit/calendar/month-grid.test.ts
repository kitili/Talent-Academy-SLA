import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  LONG_ENTRY_DAYS,
  MAX_DAY_CHIPS,
  coversDayKey,
  dayKeyOf,
  isLongEntry,
  layoutMonth,
  monthGrid,
  shiftMonth,
  spanDays,
  type CalendarItem,
} from "../../../shared/calendarGrid.ts";

const keys = (year: number, month: number) => monthGrid(year, month).flat().map((day) => day.key);

describe("monthGrid", () => {
  it("is weeks of seven days, Monday first", () => {
    const weeks = monthGrid(2027, 3); // 1 March 2027 is a Monday
    assert.ok(weeks.every((week) => week.length === 7));
    // Every column is the same weekday all the way down, and column 0 is a Monday.
    for (const week of weeks) {
      const monday = new Date(`${week[0].key}T00:00:00Z`);
      assert.equal(monday.getUTCDay(), 1, `${week[0].key} should be a Monday`);
      assert.equal(new Date(`${week[6].key}T00:00:00Z`).getUTCDay(), 0, `${week[6].key} should be a Sunday`);
    }
  });

  it("starts on the 1st with no leading days when the month begins on a Monday", () => {
    const first = monthGrid(2027, 3)[0][0]; // March 2027 begins on a Monday
    assert.equal(first.key, "2027-03-01");
    assert.equal(first.outside, false);
  });

  it("pads Sunday-start months with six leading days from the month before", () => {
    const week = monthGrid(2027, 8)[0]; // 1 August 2027 is a Sunday
    assert.deepEqual(week.map((day) => day.key), ["2027-07-26", "2027-07-27", "2027-07-28", "2027-07-29", "2027-07-30", "2027-07-31", "2027-08-01"]);
    assert.deepEqual(week.map((day) => day.outside), [true, true, true, true, true, true, false]);
  });

  it("has the right number of days, including a leap February", () => {
    const inMonth = (year: number, month: number) => monthGrid(year, month).flat().filter((day) => !day.outside).length;
    assert.equal(inMonth(2027, 2), 28);
    assert.equal(inMonth(2028, 2), 29);
    assert.equal(inMonth(2027, 4), 30);
    assert.equal(inMonth(2027, 12), 31);
    assert.equal(keys(2028, 2).includes("2028-02-29"), true);
    assert.equal(keys(2027, 2).includes("2027-02-29"), false);
  });

  it("fills the last week with the next month's days, and January follows December", () => {
    const last = monthGrid(2027, 12).at(-1)!;
    assert.equal(last[6].key.slice(0, 7) === "2027-12" || last[6].key.startsWith("2028-01"), true);
    assert.equal(last.at(-1)!.outside || last.at(-1)!.key === "2027-12-31", true);
    assert.deepEqual(shiftMonth(2027, 12, 1), { year: 2028, month: 1 });
    assert.deepEqual(shiftMonth(2027, 1, -1), { year: 2026, month: 12 });
  });

  it("needs four weeks for a 28-day February that begins on a Monday, and no more than six for any month", () => {
    assert.equal(monthGrid(2027, 2).length, 4); // 1 Feb 2027 is a Monday
    for (let month = 1; month <= 12; month += 1) {
      const count = monthGrid(2027, month).length;
      assert.ok(count >= 4 && count <= 6, `month ${month} has ${count} weeks`);
    }
  });

  it("gives every day the same shape", () => {
    for (const day of monthGrid(2027, 5).flat()) {
      assert.deepEqual(Object.keys(day).sort(), ["day", "key", "month", "outside", "year"]);
    }
  });
});

const original = process.env.TZ;
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

/** Runs the body with the viewer in the given zone. Skips quietly if this runtime ignores a changed TZ. */
function inZone(zone: string, expectedOffsetMinutes: number, body: () => void, t: { skip: (reason: string) => void }) {
  process.env.TZ = zone;
  if (new Date(Date.UTC(2027, 2, 5)).getTimezoneOffset() !== expectedOffsetMinutes) {
    t.skip(`this runtime does not apply a changed TZ (${zone})`);
    return;
  }
  body();
}

const ZONES: Array<[string, number]> = [
  ["Africa/Dar_es_Salaam", -180], // UTC+3
  ["America/Los_Angeles", 480], // UTC-8 in early March
  ["UTC", 0],
];

describe("which day an entry sits on", () => {
  const wholeDay = { startDate: "2027-03-05T00:00:00.000Z", endDate: null };
  const lateInstant = { startDate: "2027-03-05T22:30:00.000Z", endDate: null }; // 01:30 on the 6th in Dar es Salaam

  for (const [zone, offset] of ZONES) {
    it(`reads a UTC whole day as that day in ${zone}`, (t) => {
      inZone(zone, offset, () => {
        assert.equal(coversDayKey(wholeDay, "utc-day", "2027-03-05"), true);
        assert.equal(coversDayKey(wholeDay, "utc-day", "2027-03-04"), false);
        assert.equal(coversDayKey(wholeDay, "utc-day", "2027-03-06"), false);
        assert.equal(dayKeyOf(wholeDay.startDate, "utc-day"), "2027-03-05");
      }, t);
    });
  }

  it("reads an instant on the viewer's own day: the 6th in Dar es Salaam", (t) => {
    inZone("Africa/Dar_es_Salaam", -180, () => {
      assert.equal(coversDayKey(lateInstant, "local-instant", "2027-03-06"), true);
      assert.equal(coversDayKey(lateInstant, "local-instant", "2027-03-05"), false);
    }, t);
  });

  it("reads the same instant as the 5th in Los Angeles", (t) => {
    inZone("America/Los_Angeles", 480, () => {
      assert.equal(coversDayKey(lateInstant, "local-instant", "2027-03-05"), true);
      assert.equal(coversDayKey(lateInstant, "local-instant", "2027-03-06"), false);
    }, t);
  });

  it("keeps the two clocks apart: a whole day read as an instant slips a day west of UTC", (t) => {
    inZone("America/Los_Angeles", 480, () => {
      assert.equal(coversDayKey(wholeDay, "local-instant", "2027-03-04"), true, "the wrong basis shows the wrong day");
      assert.equal(coversDayKey(wholeDay, "utc-day", "2027-03-04"), false);
    }, t);
  });

  it("spreads a whole-day range over every day it covers, in UTC", () => {
    const week = { startDate: "2027-03-01T00:00:00.000Z", endDate: "2027-03-03T00:00:00.000Z" };
    assert.deepEqual(["2027-02-28", "2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04"].map((key) => coversDayKey(week, "utc-day", key)), [false, true, true, true, false]);
  });

  it("does not run a session that ends at midnight into the next day", (t) => {
    inZone("UTC", 0, () => {
      const evening = { startDate: "2027-03-05T18:00:00.000Z", endDate: "2027-03-06T00:00:00.000Z" };
      assert.equal(coversDayKey(evening, "local-instant", "2027-03-05"), true);
      assert.equal(coversDayKey(evening, "local-instant", "2027-03-06"), false);
    }, t);
  });

  it("covers nothing when the start is not a date", () => {
    assert.equal(coversDayKey({ startDate: "not a date" }, "utc-day", "2027-03-05"), false);
  });
});

function item(id: string, startDate: string, endDate: string | null, basis: CalendarItem["basis"] = "utc-day"): CalendarItem<string> {
  return { id, title: id, kind: "event", startDate, endDate, basis, source: id };
}

describe("laying entries out on a month", () => {
  const term = item("term", "2027-03-01T00:00:00.000Z", "2027-06-28T00:00:00.000Z");
  const holiday = item("holiday", "2027-03-10T00:00:00.000Z", "2027-03-12T00:00:00.000Z");

  it("counts an entry longer than seven days as long, and seven days as short", () => {
    assert.equal(LONG_ENTRY_DAYS, 7);
    assert.equal(spanDays(term, "utc-day"), 120);
    assert.equal(isLongEntry(term, "utc-day"), true);
    assert.equal(isLongEntry(item("w", "2027-03-01T00:00:00.000Z", "2027-03-07T00:00:00.000Z"), "utc-day"), false); // 7 days
    assert.equal(isLongEntry(item("w8", "2027-03-01T00:00:00.000Z", "2027-03-08T00:00:00.000Z"), "utc-day"), true); // 8 days
  });

  it("shows a long entry once in the running strip and as a chip only on its first day", () => {
    const { weeks, running } = layoutMonth([term, holiday], 2027, 4); // April: the term began in March
    assert.deepEqual(running.map((entry) => entry.id), ["term"]);
    const april = weeks.flat().filter((day) => !day.outside);
    assert.equal(april.filter((day) => day.cell.some((entry) => entry.id === "term")).length, 0, "the term has no chip in April");
    assert.equal(april.every((day) => day.items.some((entry) => entry.id === "term")), true, "but every April day still lists it when chosen");

    const march = layoutMonth([term, holiday], 2027, 3).weeks.flat().filter((day) => !day.outside);
    const withChip = march.filter((day) => day.cell.some((entry) => entry.id === "term"));
    assert.deepEqual(withChip.map((day) => day.key), ["2027-03-01"], "one chip, on the first day");
    assert.equal(march.find((day) => day.key === "2027-03-11")!.cell.map((entry) => entry.id).join(), "holiday", "a short entry repeats on each of its days");
  });

  it("keeps a month the long entry misses out of the strip", () => {
    assert.deepEqual(layoutMonth([term], 2027, 8).running, []);
    assert.deepEqual(layoutMonth([term], 2027, 2).running, []);
  });

  it("shows three chips and counts the rest as +N more", () => {
    assert.equal(MAX_DAY_CHIPS, 3);
    const five = ["e", "c", "a", "d", "b"].map((id) => item(id, "2027-03-10T00:00:00.000Z", null));
    const target = layoutMonth(five, 2027, 3).weeks.flat().find((entry) => entry.key === "2027-03-10")!;
    assert.equal(target.chips.length, 3);
    assert.equal(target.more, 2);
    assert.deepEqual(target.chips.map((entry) => entry.id), ["a", "b", "c"], "same start, so by title");
  });

  it("leaves out rows with no usable date instead of throwing", () => {
    const { weeks } = layoutMonth([item("bad", "nope", null)], 2027, 3);
    assert.equal(weeks.flat().every((day) => day.items.length === 0), true);
  });
});
