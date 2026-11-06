import { useRef, useState, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * One themed date picker and one date-and-time picker, to replace the browser's own (which look different in every
 * browser and ignore the theme). They take and give exactly the strings the native inputs did, so the call sites and
 * their conversions stay as they were:
 *   DateField      "YYYY-MM-DD"        (an empty string is no date)
 *   DateTimeField  "YYYY-MM-DDTHH:mm"  (a local time with no zone, like `datetime-local`; callers still turn it into
 *                                       an instant with `new Date(value).toISOString()`)
 *
 * Inside a Dialog the popover is a nested Radix layer, so clicks and focus in it do not count as outside the dialog.
 */

const TRIGGER =
  "relative flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-left text-[15px] text-sl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent disabled:cursor-not-allowed disabled:opacity-50";
const FOOT_BUTTON =
  "inline-flex min-h-[36px] items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3 text-sm text-sl-ink hover:bg-sl-neutral-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const SELECT =
  "h-9 rounded-md border border-sl-control bg-sl-surface px-2 text-sm text-sl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sl-accent";

export type DateFieldProps = {
  id?: string;
  /** `YYYY-MM-DD`, or an empty string for no date. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** An empty required field stops the form, as a native required input did. Without it there is a Clear control. */
  required?: boolean;
  /** Earliest day, `YYYY-MM-DD`. Earlier days cannot be chosen. */
  min?: string;
  /** Latest day, `YYYY-MM-DD`. */
  max?: string;
  /** First and last year in the month and year dropdowns. The year of the value, min and max are always included. */
  fromYear?: number;
  toYear?: number;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Local day to key, from a Date the day picker hands back. */
function keyOfDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` (or the date part of a longer value) as a local Date, or undefined when it is not a day. */
export function parseDayValue(value: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(match[2]) - 1 ? undefined : date;
}

/** "3 May 2027" */
export function dayLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** A time as `HH:mm` from a `YYYY-MM-DDTHH:mm` value, or the fallback. */
export function parseTimeValue(value: string | undefined, fallback = "09:00") {
  const match = /T(\d{2}):(\d{2})/.exec(value || "");
  return match ? `${match[1]}:${match[2]}` : fallback;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
const STEP_MINUTES = Array.from({ length: 12 }, (_, step) => pad(step * 5));

/** Every 5 minutes, plus the current minute when it is not on a step, so an existing value is never rewritten. */
export function minuteOptions(current: string) {
  return STEP_MINUTES.includes(current) ? STEP_MINUTES : [...STEP_MINUTES, current].sort();
}

function DayPopover({
  props,
  display,
  children,
  footer,
  hasValue,
  open,
  setOpen,
  selected,
  onPick,
}: {
  props: DateFieldProps;
  display: string;
  children?: ReactNode;
  footer?: ReactNode;
  hasValue: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  selected: Date | undefined;
  onPick: (date: Date | undefined) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const thisYear = new Date().getFullYear();
  const minDay = parseDayValue(props.min);
  const maxDay = parseDayValue(props.max);
  const from = Math.min(props.fromYear ?? thisYear - 5, selected?.getFullYear() ?? Infinity, minDay?.getFullYear() ?? Infinity);
  const to = Math.max(props.toYear ?? thisYear + 10, selected?.getFullYear() ?? -Infinity, maxDay?.getFullYear() ?? -Infinity);
  const disabledDays = [minDay ? { before: minDay } : undefined, maxDay ? { after: maxDay } : undefined].filter(Boolean) as Array<
    { before: Date } | { after: Date }
  >;
  return (
    <div className={cn("relative", props.className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            id={props.id}
            className={TRIGGER}
            disabled={props.disabled}
            aria-haspopup="dialog"
            aria-describedby={props["aria-describedby"]}
            aria-label={props["aria-label"]}
            data-testid={props["data-testid"]}
          >
            <span className={cn("min-w-0 truncate", !hasValue && "text-sl-muted")}>{hasValue ? display : props.placeholder ?? "Choose a date"}</span>
            <CalendarDays className="h-4 w-4 shrink-0 text-sl-muted" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto border-sl-line bg-sl-surface p-0 text-sl-ink">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={onPick}
            defaultMonth={selected ?? minDay ?? new Date()}
            captionLayout="dropdown-buttons"
            fromYear={from}
            toYear={to}
            weekStartsOn={1}
            disabled={disabledDays.length ? disabledDays : undefined}
            initialFocus
          />
          {children}
          {(footer || (!props.required && hasValue)) && (
            <div className="flex items-center justify-between gap-2 border-t border-sl-line px-3 py-2">
              {!props.required && hasValue ? (
                <button
                  type="button"
                  className={FOOT_BUTTON}
                  onClick={() => { props.onChange(""); setOpen(false); }}
                  data-testid={props["data-testid"] ? `${props["data-testid"]}-clear` : undefined}
                >
                  Clear
                </button>
              ) : <span />}
              {footer}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {props.required && (
        // A native required input that nobody sees: an empty required field still stops the form, and the browser's
        // message points at the trigger. Focus sent to it is passed on to the button.
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={hasValue ? "set" : ""}
          onChange={() => undefined}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      )}
    </div>
  );
}

export function DateField(props: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDayValue(props.value);
  return (
    <DayPopover
      props={props}
      open={open}
      setOpen={setOpen}
      hasValue={Boolean(selected)}
      display={selected ? dayLabel(selected) : ""}
      selected={selected}
      onPick={(date) => {
        if (date) props.onChange(keyOfDate(date));
        setOpen(false);
      }}
    />
  );
}

export type DateTimeFieldProps = Omit<DateFieldProps, "min" | "max"> & {
  /** `YYYY-MM-DDTHH:mm`. Only its day is enforced: earlier days cannot be chosen. */
  min?: string;
  max?: string;
};

export function DateTimeField(props: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [draftTime, setDraftTime] = useState("09:00");
  const selected = parseDayValue(props.value);
  const time = selected ? parseTimeValue(props.value) : draftTime;
  const [hour, minute] = time.split(":");
  const emit = (day: Date, nextTime: string) => props.onChange(`${keyOfDate(day)}T${nextTime}`);
  const setTime = (nextTime: string) => {
    setDraftTime(nextTime);
    if (selected) emit(selected, nextTime);
  };
  const idPart = props.id ?? "datetime";

  return (
    <DayPopover
      props={props}
      open={open}
      setOpen={setOpen}
      hasValue={Boolean(selected)}
      display={selected ? `${dayLabel(selected)}, ${time}` : ""}
      selected={selected}
      onPick={(date) => { if (date) emit(date, time); }}
      footer={<button type="button" className={FOOT_BUTTON} onClick={() => setOpen(false)}>Done</button>}
    >
      <div className="flex items-center gap-2 border-t border-sl-line px-3 py-2">
        <span className="text-sm text-sl-muted">Time</span>
        <label htmlFor={`${idPart}-hour`} className="sr-only">Hour</label>
        <select id={`${idPart}-hour`} className={SELECT} value={hour} onChange={(event) => setTime(`${event.target.value}:${minute}`)}>
          {HOURS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <span aria-hidden="true" className="text-sl-muted">:</span>
        <label htmlFor={`${idPart}-minute`} className="sr-only">Minute</label>
        <select id={`${idPart}-minute`} className={SELECT} value={minute} onChange={(event) => setTime(`${hour}:${event.target.value}`)}>
          {minuteOptions(minute).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </DayPopover>
  );
}
