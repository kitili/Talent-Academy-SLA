# A row that scrolls with no scrollbar reads as a row that ends

**Scope:** transferable

## The symptom

With a report open beside a workstream, the phase rail at the top of the conversation showed two
phases and a third cut in half at the right edge. Reviewers reported it as "squished". The current
phase, the one thing the rail is for at a glance, was often among those off-screen (SPL-4517).

## Why it was misleading

Nothing was broken in the code's own terms. The rail had been made to scroll sideways on purpose, with
`no-scrollbar` so a second horizontal line would not sit under the row, and every node was `shrink-0`
so nothing squeezed. Each decision was right on a wide screen, where the row fits and never scrolls.
The narrow case only exists once a panel opens beside the column. Hidden overflow gives no sign that
there is more, so a reader sees a row that ends, cut off, and nobody thinks to scroll it.

## The check

- When you hide a scrollbar, ask how a reader learns the content continues. If nothing tells them,
  the row has to fit: change what it shows at that width (here, discs only and the current name)
  rather than letting it overflow.
- Decide a "does it fit" mode from a hidden copy laid out the full way, not from the visible element.
  Measuring the element you are about to shrink flips the mode back the moment it fits, and oscillates.
- Test it in a column as narrow as the real one beside an open panel, in a browser. A fixture section
  with a fixed width (`narrow-rail` in the stepper fixture) is enough.
