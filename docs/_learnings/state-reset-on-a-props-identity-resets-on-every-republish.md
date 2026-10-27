# State reset on a prop's identity resets on every republish

**Scope:** transferable
**Where:** the Map & Schema match list (`MatchListPopover` in
`src/components/canvas/GraphFilterToolbar.tsx`). Found 2026-09-23 from a user report.

## The symptom

With a filter applied and the match list open, the up / down arrows did nothing visible: Next kept
opening the first match and Previous the last, whatever was selected.

## Why it was misleading

The list reset its cursor in `useEffect(() => setCursor(null), [items, query])`, meaning "a new match set
restarts the stepping". But `items` was a new array on every publish, not only on a new set: each step
focuses the element, the Map drills into it and re-renders, and the renderer's filter pass republishes
the same matches as a fresh array. So every click restarted the cursor, and `stepMatchCursor(null, …)`
lands on the first row going forward and the last going back. Pure tests of `stepMatchCursor` passed, and
the browser test that clicks Next after a row (`system-graph.spec.ts`) would have caught it, but its
fixture route is not on the branch it shipped from.

## The check

- An effect that resets state "when the data changes" must key on the data's content (ids joined, a
  signature), not the prop's identity, unless every producer memoises it and says so.
- Keep a list cursor as the current item's id, not its index, so a republished or reordered list keeps
  its place.
- Test it with a host that republishes an identical list after each interaction:
  `tests/unit/canvas/graphFilterMatchList.test.ts` does, and fails on the old code with the reported
  shape (`p:1` focused three times).

## Status

Fixed 2026-09-23: the cursor is the row's id, reset only when the set of ids or the search text changes.

Related: [a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md](a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md),
[a-visible-control-is-not-a-hydrated-one.md](a-visible-control-is-not-a-hydrated-one.md)
