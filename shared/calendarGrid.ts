import { coversDay, type DatedRow } from "./academyPeople";

/**
 * The month grid behind the Calendar / Schedule pages and the cohort room's calendar.
 *
 * Every function here is pure. Days are named by a `YYYY-MM-DD` key, so a grid never depends on the machine's zone;
 * only `dayKeyOf` and the `local-instant` rule read the viewer's zone, on purpose.
 */

/**
 * Which clock decides the day an entry sits on. This is the trap the page can get wrong silently.
 * - `utc-day`: a whole day stored at UTC midnight (the academy calendar). It is read in UTC, so 2027-03-05 is the 5th
 *   for a viewer in Dar es Salaam and in Los Angeles alike. Reading it locally would move it to the 4th.
 * - `local-instant`: a moment (a scheduled session). It sits on the viewer's own day, so 22:30 UTC is the next morning
 *   in Dar es Salaam.
 */
export type DayBasis = "utc-day" | "local-instant";

export type GridDay = {
  /** `2027-03-05` */
  key: string;
  year: number;
  /** 1 to 12 */
  month: number;
  /** 1 to 31 */
  day: number;
  /** A day of the previous or next month, drawn to fill the first and last week. */
  outside: boolean;
};

/** An entry longer than this many days is shown once, in the running strip, and as a chip only on its first day. */
export const LONG_ENTRY_DAYS = 7;
/** Chips a day cell shows before "+N more". */
export const MAX_DAY_CHIPS = 3;

const pad = (value: number) => String(value).padStart(2, "0");
const DAY_MS = 86_400_000;

export function dayKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/** `2027-03` for a month. */
export function monthKeyOf(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

/** A day key as a Date at UTC midnight, for arithmetic and for printing with `timeZone: "UTC"`. */
export function dayKeyToUtcDate(key: string) {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The month before or after (month 1 to 12, so December plus one is January of the next year). */
export function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The weeks of a month, Monday first. `month` is 1 to 12. Each week is 7 days; the first and last carry the
 * neighbouring months' days with `outside: true`. A month needs 4 to 6 weeks.
 */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday is 0, Sunday is 6
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((lead + length) / 7) * 7;
  const weeks: GridDay[][] = [];
  for (let slot = 0; slot < total; slot += 7) {
    const week: GridDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(Date.UTC(year, month - 1, 1 - lead + slot + offset));
      week.push({
        key: dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        outside: date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** The day a moment falls on, on the given basis. */
export function dayKeyOf(value: string | Date, basis: DayBasis) {
  const date = value instanceof Date ? value : new Date(value);
  return basis === "utc-day"
    ? dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    : dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function lastMoment(row: DatedRow) {
  const start = new Date(row.startDate);
  const end = row.endDate ? new Date(row.endDate) : start;
  return end.getTime() > start.getTime() ? end : start;
}

/** The first and last day key an entry touches. An end exactly at local midnight belongs to the day before. */
export function entryDayRange(row: DatedRow, basis: DayBasis) {
  const start = new Date(row.startDate);
  let end = lastMoment(row);
  if (basis === "local-instant" && end.getTime() > start.getTime()) {
    const atMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0;
    if (atMidnight) end = new Date(end.getTime() - 1);
  }
  return { from: dayKeyOf(start, basis), to: dayKeyOf(end, basis) };
}

/** Does the entry sit on this day? A whole-day entry uses `coversDay` (UTC); an instant compares the viewer's day keys. */
export function coversDayKey(row: DatedRow, basis: DayBasis, key: string) {
  if (Number.isNaN(new Date(row.startDate).getTime())) return false;
  if (basis === "utc-day") return coversDay(row, dayKeyToUtcDate(key));
  const { from, to } = entryDayRange(row, basis);
  return from <= key && key <= to;
}

/** How many days an entry spans, counting the first and the last. */
export function spanDays(row: DatedRow, basis: DayBasis) {
  const { from, to } = entryDayRange(row, basis);
  return Math.round((dayKeyToUtcDate(to).getTime() - dayKeyToUtcDate(from).getTime()) / DAY_MS) + 1;
}

export function isLongEntry(row: DatedRow, basis: DayBasis) {
  return spanDays(row, basis) > LONG_ENTRY_DAYS;
}

/** One row on the calendar. `basis` says which clock reads its day (see `DayBasis`). */
export type CalendarItem<T = unknown> = {
  id: string;
  title: string;
  /** Picks the chip colour. */
  kind: string;
  startDate: string;
  endDate?: string | null;
  basis: DayBasis;
  /** The page's own row, handed back to render the full entry. */
  source: T;
};

export type LaidOutDay<T> = GridDay & {
  /** Everything that sits on this day, long entries included, in time order: the list shown when the day is chosen. */
  items: CalendarItem<T>[];
  /** What the cell draws: short entries on the day, and a long entry only on its first day. */
  cell: CalendarItem<T>[];
  /** The first `MAX_DAY_CHIPS` of `cell`. */
  chips: CalendarItem<T>[];
  /** `cell` entries beyond the chips: the number in "+N more". */
  more: number;
};

function byStart(a: CalendarItem<unknown>, b: CalendarItem<unknown>) {
  return new Date(a.startDate).getTime() - new Date(b.startDate).getTime() || a.title.localeCompare(b.title);
}

/** Places every item on a month's grid. `running` holds the long entries that touch the month, for the strip above it. */
export function layoutMonth<T>(items: CalendarItem<T>[], year: number, month: number) {
  const weeks = monthGrid(year, month);
  const usable = items.filter((item) => !Number.isNaN(new Date(item.startDate).getTime())).sort(byStart);
  const info = usable.map((item) => ({ item, long: isLongEntry(item, item.basis), range: entryDayRange(item, item.basis) }));
  const first = dayKey(year, month, 1);
  const last = dayKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

  const laid: LaidOutDay<T>[][] = weeks.map((week) => week.map((day) => {
    const here = info.filter(({ item }) => coversDayKey(item, item.basis, day.key));
    const cell = here.filter(({ long, range }) => !long || range.from === day.key).map(({ item }) => item);
    return { ...day, items: here.map(({ item }) => item), cell, chips: cell.slice(0, MAX_DAY_CHIPS), more: Math.max(0, cell.length - MAX_DAY_CHIPS) };
  }));

  const running = info.filter(({ long, range }) => long && range.from <= last && range.to >= first).map(({ item }) => item);
  return { weeks: laid, running };
}
