# A call pattern cut at the first `)` misses every argument after a nested call

**Scope:** transferable
**Area:** regex scans of source code for what a call is given: `src/utils/process-graph/preferenceBlastRadius.ts`
(`CREATE_CALL`, the accounting preference reach's "creates transactions" flag).
**Status:** fixed on 2026-10-14 (branch of worker PREF-GAPS; the window is now the next 200 characters, as contract C3 says).

## The symptom

`record.create({ type: getType(), ... record.Type.INVOICE ... })` and `nlapiTransformRecord(from(rec), id, 'invoice')`
were not reported as transaction creates. Nothing failed: the reach said fewer scripts create transactions, which reads
as "less to worry about" on an approval card.

## Why it was misleading

The pattern was `create\s*\(([^)]{0,200})` and the plan's contract said "the next 200 characters". The `{0,200}` made
it look like the window the contract asked for, and every test passed: the tests named the type before any nested
call. On the demo's 29 read scripts the old and new patterns agree, so a fixture or corpus check alone would not have
shown it either.

## Why it happens

`[^)]` stops at the first `)`, and a nested call's `)` comes first: `getType()` ends the arguments before `type` is
named. The cap of 200 is a ceiling, not a window. A second trap sits beside it: a consuming window (`([\s\S]{0,200})`)
swallows a second create inside the first one's 200 characters, so that create never gets a window of its own.

## What to do

- To read "the next N characters", read them: a lookahead, `\((?=([\s\S]{0,N}))`, so each match gets its own window
  and none is consumed.
- A fixed window over-reports into the next statement; say so where the result is shown, and prefer that to a silent
  miss when the result is a warning.
- Test a nested call before the target, a target just past N (not matched), and a second call inside the first one's
  window; remove the fix and see each fail.
