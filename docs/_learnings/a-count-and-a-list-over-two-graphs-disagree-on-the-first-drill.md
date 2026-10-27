# A count and a list built over two different graphs disagree the first time the reader drills

**Scope:** transferable
**Where:** the Map & Schema page's filter toolbar (`RecordGraphPreview`, `SystemGraphPanes`), 2026-09-20.

## What happened

The toolbar showed **"7 of 1,860 elements"** and, one click away, a match list of **39 rows** — for the
same filter, at the same moment. The reader had drilled into a record through that very list.

The count was computed over the **drawn** yFiles nodes. A focused view draws only the in-scope subset
(`placeFocused` places in-scope nodes; the build loop skips the rest with `if (!placement) continue`), so
in a focus the count described a few dozen nodes. The list had deliberately been published from the
**universe** pass only, so a drill would not shrink it under the reader mid-step — and so it described all
1,860. The total came from the whole model. Three numbers, two scopes, and every one of them was
"correct" for the graph it was computed over.

Nothing about this showed at the universe level, where the drawn graph *is* the whole system and both
passes see the same nodes. It appeared only after a drill, and the match list made drilling a one-click
action — the feature surfaced the mismatch it was built on.

## Why it is a trap

- Each number had a defensible origin, so nobody had asked which graph the toolbar was talking about.
  The predicate read node **tags**, which only drawn nodes have, so "over the drawn graph" was not a
  decision anyone took; it was the only thing the code could do.
- Keeping one of the numbers from an earlier view (the universe list) looks like consistency and is the
  opposite: it freezes one side while the other keeps following the canvas.
- Users read a count and a list that disagree as a **union bug** ("more than two filters should
  intersect"). The filters were already an intersection; the report pointed at the predicate when the
  fault was the scope.

## The rule

A count and a list that sit next to each other must be **two projections of one set**, computed over
**one source**. Here: the predicate became a pure function over per-node *facts* that the build computes
for **every** model node before the placement skip (`mapFilterPredicate.ts`); a *system pass* over those
facts produces the count and the list together, in every view; the *drawn pass* evaluates the same facts
over the canvas nodes for hide / dependency / frame and never produces toolbar numbers. The drawn subset is a
projection, not a second source of truth.

When a number describes a subset on purpose (the modal's "k in scope · n matching"), say so in the label
and keep it next to the thing it describes (the breadcrumb, the drawer) — never beside a system-wide one.

## The same trap as a fallback (2026-10-09)

The Business Logic Map's Expand in place was meant to show a function's flowcharts. It decided
"is there a flowchart to show" over the **drawn** subset — the artifacts on a touchpoint edge — and
when that subset held no workflow with a flow it fell back, silently, to the full connections graph.
On "Audit Readiness Health Check"'s Credit & Collections (265 processes) the function's two real
workflows with flows were not on any edge, so the reader got "Showing 19 connected · +246 more" and
a graph of artifact tiles instead of the two flowcharts. A fallback that changes *what kind of thing*
a view shows is a second behaviour, decided over a projection. The fix removed the connections mode
and the fallback outright: the view takes the one set it shows (every constituent that can get a
splotch) and an empty set is an empty state, never another view.

## How to check for it

Before shipping a summary number beside a list, drill into something and read both again. If the view
can show a subset of the data, ask of every number on screen: *over which set?* — and make the answer the
same, or make the labels say otherwise.
