# A flexible pane with fixed siblings collapses under them

**Scope:** transferable

## The symptom

On the Map, an installed SuiteSuccess script's object panel printed its Code-pane message ("No source
is shown for customscript_ss_config_data_import_si: its file, SuiteApps/…, is installed package code…")
straight over the Dependencies heading, its 1 / 2 / 3 buttons and "No linked records for this object".
Two blocks of text shared the same pixels. Nothing in the code had touched the Code pane.

## Why it was misleading

The panel body was a column: `flex min-h-0 flex-1 flex-col`, no overflow. Its only flexible child was
the Description / Code pane (`flex min-h-0 flex-1`), and every section below it was `flex-shrink-0`. At
first there was room for everything. Then, one change at a time, sections arrived below the pane: the
required features, the six deployment facts, the SuiteScript version, the script metadata. Each was
right on its own and each was fixed-height. Once they outgrew the panel, flexbox took the missing space
from the only item allowed to shrink. `min-h-0` let that pane shrink to nothing, and its unclipped
`<p>` kept drawing at full height over whatever came next.

The overlap appeared on the page and in no diff. A reviewer of the last section to arrive saw a small,
correct addition, because the defect is a property of the sum.

## The check

- A column where one child is `flex-1 min-h-0` and the rest are `flex-shrink-0` is a budget. Every
  fixed sibling you add spends it. Give the flexible child a floor (`min-h-[…]`) or put the column in a
  scroll container, so running out of room scrolls instead of collapsing.
- Text inside a pane that can shrink must sit in an element that clips or scrolls (`overflow-auto`), or
  the collapse shows up as an overlap rather than a scrollbar.
- When a panel keeps gaining sections, change the structure rather than add one more: here, a
  properties card of label / value rows, and tabs that each own the whole height.

Designed out on 2026-09-24. The object panel's Overview tab is one scroll column, and the Code tab owns
the full height (`MapDetailSidePanel.tsx`, `tests/unit/canvas/mapDetailObjectProperties.test.ts`).

## Evidence

- The screenshot of `customscript_ss_config_data_import_si` (4a Demo Project, 2026-09-24): the Code
  pane's reason and the Dependencies row drawn over each other.
- The panel before the redesign: a `flex min-h-0 flex-1` pane followed by six `flex-shrink-0`
  sections, inside a body with no overflow.
