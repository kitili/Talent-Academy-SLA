import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const NAV_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-sl-control bg-sl-surface p-0 text-sl-ink hover:bg-sl-neutral-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent"

/**
 * The themed day picker used by `DateField`. Colours come from the `sl-*` tokens so it follows light and dark.
 * With `captionLayout="dropdown-buttons"` the month and year are real selects and the plain caption text is hidden
 * (it only repeats what the selects show).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  weekStartsOn = 1,
  ...props
}: CalendarProps) {
  const dropdowns = Boolean(props.captionLayout && props.captionLayout !== "buttons")
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "relative flex items-center justify-center px-8 pt-1",
        caption_label: dropdowns ? "hidden" : "text-sm font-medium text-sl-ink",
        caption_dropdowns: "flex items-center gap-1.5",
        vhidden: "sr-only",
        dropdown_month: "relative",
        dropdown_year: "relative",
        dropdown:
          "h-8 rounded-md border border-sl-control bg-sl-surface px-1.5 text-sm text-sl-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sl-accent",
        dropdown_icon: "hidden",
        nav: "flex items-center space-x-1",
        nav_button: NAV_BUTTON,
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "w-9 rounded-md text-[0.8rem] font-normal text-sl-muted",
        row: "mt-2 flex w-full",
        cell: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day: "inline-flex h-9 w-9 items-center justify-center rounded-md p-0 text-sm font-normal text-sl-ink hover:bg-sl-neutral-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sl-accent aria-selected:opacity-100",
        // aria-selected variants sort after plain utilities, so a selected today stays solid blue.
        day_selected: "aria-selected:bg-sl-accent-strong aria-selected:text-white aria-selected:hover:bg-sl-accent-strong",
        day_today: "bg-sl-accent-soft font-semibold text-sl-accent",
        day_outside: "text-sl-muted opacity-60 aria-selected:bg-sl-neutral-soft aria-selected:text-sl-muted",
        day_disabled: "text-sl-muted opacity-40",
        day_range_middle: "aria-selected:bg-sl-accent-soft aria-selected:text-sl-accent",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
