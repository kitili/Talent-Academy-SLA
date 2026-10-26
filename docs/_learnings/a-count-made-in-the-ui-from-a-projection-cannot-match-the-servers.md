# A count made in the UI from a projection cannot match the server's

**Scope:** transferable
**Area:** any screen that shows a count beside a list built from the same data, here the action plan summary's "This change touches N parts of your system" (`src/components/live-report/action-summary/boardCopy.ts`, `composeTouches`).
**Status:** designed out on 2026-10-23 by `estimate.touches`, computed at write (T4b, `7c4097776`) and drawn as held by the board (`e89692206`). Found while building the board, before it shipped; never seen on a customer's screen.

## The symptom

The board's first version of the sentence (T6 round 2, before T4b's `estimate.touches`) had nothing to read the sentence's numbers from, so it counted: the distinct targets its steps list, plus the automations the estimate re-tests (`44b6b59e4`, "touches counts distinct components; T4b will supply estimate.touches"). Internally that worked, because every target carries a `kind:identity` key and two steps changing one component count once.

The external reader's payload has no identity. A target outside the shared map arrives blanked ("a component outside the shared map"), so the UI cannot tell one such target from another. The code says so in a comment: it is "listed each time, since nothing tells it from another". Two steps that change the same out-of-share component would have read as two parts on the shared page and one on the internal board, for the same summary. (Inferred from the code; never reproduced on a deployed board.)

## Why it was misleading

Counting the list in front of you looks harmless, and it is right on the screen where the list is complete. The projection is the boundary: whatever it withholds is also what a count needs to dedupe. The two readers shared one component, one test fixture and one sentence, so the difference appeared only when the same body was read through both adapters.

## Why it happens

A count is a function of data the reader may not have. The server counts over the full resolution (distinct resolved targets, the impact read's automations, created names) and the UI counts over what survived the projection. They agree exactly when the projection withholds nothing, which is the case the projection exists to avoid.

## What to do

- Send the number as a number. `estimate.touches` is `{ total, change, retest, creates }`, computed once at write from the same resolution, and `total` is `null` when the impact read did not run, so a part of the sum is never shown as the whole.
- Let the screen draw it and nothing else: the board's header comment says it never adds, multiplies, rounds or compares two numbers to make a third, and `actionSummaryBoardRound2.test.ts` pins that the lists on the page do not move the sentence.
- Treat a UI-side `.length` or `new Set(...).size` of projected data that is shown as a count as a smell. Ask whether the server could send it, and what the projection removes that the count needs.

Related: [a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md](a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md), [a-failed-count-stored-as-zero-is-an-observation-nobody-made.md](a-failed-count-stored-as-zero-is-an-observation-nobody-made.md)
