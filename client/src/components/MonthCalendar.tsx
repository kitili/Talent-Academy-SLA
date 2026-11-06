import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthTitle } from "@shared/academyPeople";
import {
  dayKeyOf,
  dayKeyToUtcDate,
  layoutMonth,
  monthKeyOf,
  parseDayKey,
  shiftMonth,
  type CalendarItem,
  type DayBasis,
} from "@shared/calendarGrid";

/** Chip colours by kind. Blue and yellow only, from the `sl-*` tokens. */
export const KIND_CHIP: Record<string, string> = {
  term: "bg-sl-accent-soft text-sl-accent",
  training: "bg-sl-done-soft text-sl-done",
  assessment: "bg-sl-attention-soft text-sl-attention",
  deadline: "bg-sl-risk-soft text-sl-risk",
  holiday: "bg-sl-neutral-soft text-sl-neutral",
  event: "bg-sl-neutral-soft text-sl-neutral",
  session: "bg-sl-accent-soft text-sl-accent",
  other: "bg-sl-neutral-soft text-sl-neutral",
};

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const NAV_BUTTON = `inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-sl-control bg-sl-surface px-3 text-sm text-sl-ink hover:bg-sl-neutral-soft ${FOCUS}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function longDay(key: string) {
  return dayKeyToUtcDate(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "5 Mar" or "5 Mar - 28 Jun", on the clock the item's basis names. */
function rangeText(item: CalendarItem<unknown>) {
  const fmt = (value: string) =>
    new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(item.basis === "utc-day" ? { timeZone: "UTC" } : {}) });
  const start = fmt(item.startDate);
  const end = item.endDate ? fmt(item.endDate) : start;
  return end === start ? start : `${start} – ${end}`;
}

export type MonthCalendarProps<T> = {
  /** Every row to place. Each says which clock reads its day (`basis`): UTC for whole days, local for sessions. */
  items: CalendarItem<T>[];
  /** The full entry, drawn under the grid for the chosen day. The page passes its own row so Edit, Remove and Join stay. */
  renderEntry: (item: CalendarItem<T>) => ReactNode;
  /** Called with the month on show, including when the calendar first opens, so a page can load what that month needs. */
  onMonthChange?: (month: { year: number; month: number }) => void;
  /** Words for a chosen day with nothing on it. */
  emptyDay?: string;
  "data-testid"?: string;
};

/**
 * A month grid, Monday first, used by both Calendar / Schedule tabs and the cohort room.
 *
 * Distortion guard: seven columns of `minmax(0,1fr)`, `min-w-0` and `truncate` on everything inside a cell, and one
 * minimum cell height, so a long title can never widen a column or push the page sideways. It is a CSS grid, not a table.
 * Below `sm` the cells show the day number and a dot only; the chosen day's entries are listed under the grid.
 */
export function MonthCalendar<T>({ items, renderEntry, onMonthChange, emptyDay = "Nothing on this day.", ...rest }: MonthCalendarProps<T>) {
  const [todayKey] = useState(() => dayKeyOf(new Date(), "local-instant"));
  const [shown, setShown] = useState(() => {
    const today = parseDayKey(todayKey);
    return { year: today.year, month: today.month };
  });
  const [picked, setPicked] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onMonthChange?.(shown); }, [shown.year, shown.month]); // eslint-disable-line react-hooks/exhaustive-deps

  const { weeks, running } = useMemo(() => layoutMonth(items, shown.year, shown.month), [items, shown.year, shown.month]);
  const days = useMemo(() => weeks.flat(), [weeks]);
  const prefix = `${monthKeyOf(shown.year, shown.month)}-`;
  const fallbackKey = days.find((day) => !day.outside && day.key === todayKey)?.key
    ?? days.find((day) => !day.outside && day.cell.length > 0)?.key
    ?? `${prefix}01`;
  const selectedKey = picked && picked.startsWith(prefix) ? picked : fallbackKey;
  const selectedDay = days.find((day) => day.key === selectedKey);
  const title = monthTitle(monthKeyOf(shown.year, shown.month));

  const go = (by: number) => { setShown((now) => shiftMonth(now.year, now.month, by)); setPicked(null); };
  const goToday = () => {
    const today = parseDayKey(todayKey);
    setShown({ year: today.year, month: today.month });
    setPicked(todayKey);
  };
  const choose = (key: string) => {
    const day = parseDayKey(key);
    if (!key.startsWith(prefix)) setShown({ year: day.year, month: day.month });
    setPicked(key);
  };
  const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = arrows[event.key];
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day;
    if (!step || !from) return;
    const target = new Date(dayKeyToUtcDate(from).getTime() + step * 86_400_000);
    const key = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
    const next = gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`);
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className="min-w-0 space-y-3" {...rest}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold text-sl-ink" aria-live="polite" data-testid="month-title">{title}</h3>
        <div className="flex gap-2">
          <button type="button" className={NAV_BUTTON} onClick={() => go(-1)} aria-label="Previous month" data-testid="month-previous">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <button type="button" className={NAV_BUTTON} onClick={goToday} data-testid="month-today">Today</button>
          <button type="button" className={NAV_BUTTON} onClick={() => go(1)} aria-label="Next month" data-testid="month-next">
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {running.length > 0 && (
        <section aria-label="Running this month" className="min-w-0 space-y-1 rounded-xl border border-sl-line bg-sl-surface p-3" data-testid="month-running">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sl-muted">Running this month</h4>
          {running.map((item) => (
            <p key={item.id} className={`min-w-0 truncate rounded px-2 py-1 text-xs font-medium ${KIND_CHIP[item.kind] ?? KIND_CHIP.other}`} title={`${item.title}, ${rangeText(item)}`}>
              {item.title}<span className="font-normal"> · {rangeText(item)}</span>
            </p>
          ))}
        </section>
      )}

      <div className="min-w-0 overflow-hidden rounded-xl border border-sl-line bg-sl-surface">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-b border-sl-line bg-sl-nav text-center text-xs font-semibold text-sl-muted" aria-hidden="true">
          {WEEKDAYS.map((name) => (
            <span key={name} className="min-w-0 truncate py-2">
              <span className="sm:hidden">{name[0]}</span>
              <span className="hidden sm:inline">{name}</span>
            </span>
          ))}
        </div>
        <div ref={gridRef} onKeyDown={onKeyDown} className="-mb-px grid grid-cols-[repeat(7,minmax(0,1fr))]" data-testid="month-grid">
          {days.map((day) => {
            const today = day.key === todayKey;
            const selected = day.key === selectedKey;
            const count = day.cell.length;
            return (
              <button
                key={day.key}
                type="button"
                data-day={day.key}
                data-testid={`day-${day.key}`}
                tabIndex={selected ? 0 : -1}
                aria-label={`${longDay(day.key)}, ${count === 0 ? "no items" : count === 1 ? "1 item" : `${count} items`}`}
                aria-pressed={selected}
                aria-current={today ? "date" : undefined}
                onClick={() => choose(day.key)}
                className={`flex min-h-12 min-w-0 flex-col items-center gap-1 overflow-hidden border-b border-r border-sl-line p-1 text-left [&:nth-child(7n)]:border-r-0 sm:min-h-[5.5rem] sm:items-stretch sm:p-1.5 ${
                  selected ? "bg-sl-accent-soft ring-2 ring-inset ring-sl-accent" : day.outside ? "bg-sl-ground hover:bg-sl-neutral-soft" : "bg-sl-surface hover:bg-sl-neutral-soft"
                } ${FOCUS} focus-visible:-outline-offset-2`}
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold sm:self-start ${
                    today ? "bg-sl-accent-strong text-white" : day.outside ? "text-sl-muted" : "text-sl-ink"
                  }`}
                >
                  {day.day}
                </span>
                {count > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sl-accent sm:hidden" aria-hidden="true" />}
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {day.chips.map((item) => (
                    <span key={item.id} className={`block min-w-0 truncate rounded px-1.5 py-0.5 text-xs font-medium ${KIND_CHIP[item.kind] ?? KIND_CHIP.other} ${day.outside ? "opacity-70" : ""}`}>
                      {item.title}
                    </span>
                  ))}
                  {day.more > 0 && <span className="min-w-0 truncate px-1 text-xs font-medium text-sl-muted">+{day.more} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section aria-label="Chosen day" className="min-w-0 space-y-2" data-testid="month-day-list">
        <h4 className="text-base font-semibold text-sl-ink">{longDay(selectedKey)}</h4>
        {selectedDay && selectedDay.items.length > 0
          ? selectedDay.items.map((item) => <div key={item.id} className="min-w-0">{renderEntry(item)}</div>)
          : <p className="rounded-xl border border-sl-line bg-sl-surface px-5 py-4 text-sm text-sl-muted">{emptyDay}</p>}
      </section>
    </div>
  );
}

export type { CalendarItem, DayBasis };
