# A head fetched on mount brings answered cards back

**Scope:** transferable
**Area:** agent interrupt cards on the project screens (workstream, onboarding, goal modal): `useSettledInterrupts`,
the four project interrupt hooks, `@langchain/langgraph-sdk`'s `interrupt`/`interrupts` accessors. Found 2026-10-14
(I-22, test 15 of the 2026-10-13 SI run). **Designed out** the same day: `usePendingInterrupts` and K2's
`pendingInterrupts` (`src/utils/agent-cards/cardState.ts`).

## The symptom

A cleanup retire was approved, applied (job completed, cleanup occurrence succeeded) and stamped `decision: approve`.
When the resumed run ended, the workstream drew the same card again, with **Yes, run this action** live. Answered
question cards came back the same way below the agent's final answer, reading "1 of 3", so they looked unanswered.
Only the server having consumed the interrupt already kept a second approval from doing anything.

## Why it was misleading

A fix for exactly this was already in: `useSettledInterrupts` re-reads `threads.getState` when a run settles,
documented as ending "an answered one came back when the resumed run finished". Its read was correct and empty. It was
added **beside** the SDK's accessors ("never instead of them"), and the accessors were the stale source:

- with checkpoint history off, `stream.interrupt`/`stream.interrupts` fall back, whenever the values carry no
  `__interrupt__` frame, to the thread head the SDK fetched on mount, and that head is never refreshed;
- a page opened while the card was pending has that card in its head for as long as it stays mounted;
- while the resumed run goes, the accessors return `[]`, so the hooks' optimistic "handled" fingerprint resets to
  null; when the run ends, the head's copy returns with the same id and nothing suppresses it.

A union of a fresh empty answer and a stale non-empty one is the stale one. Adding the authoritative source did not
remove the wrong one.

## The rule

When you add an authoritative read to correct a stale source, **replace** the stale source from the moment the
authoritative one applies; do not merge them. Here: before any run on this mount, the head is fresh and is used;
once a run has settled, the after-run read is used instead, and nothing is drawn while it is in flight; if it fails
(bounded retries), fall back to the SDK so a real card is never hidden for good. Add a second, durable check that does
not depend on any copy of the interrupt list: the paused call's result in the thread's messages (the approval payload
names its `tool_call_id`; a stamped result is a decision, an unstamped one a superseded card).

## The check

```bash
# A union of sources that disagree keeps the stale one.
rg "collectInterrupts\(.*settled" src
rg "beside .*never instead" src docs
```

A card hook should take its list from one function with a test that drives answer, run, settle-with-a-stale-head:
`tests/unit/workstream-actions/approvalCardResurrection.test.ts` fails on the old merge.

## Related

- [optimistic-hide-is-not-a-safety-mechanism.md](optimistic-hide-is-not-a-safety-mechanism.md): the fingerprint that
  the empty run window resets.
- [hydrating-a-transcript-is-not-restoring-a-run.md](hydrating-a-transcript-is-not-restoring-a-run.md): why a failed
  read must fail open.
- `plans/workstream-actions/k2-card-state-contract.md`, `plans/workstream-actions/approval-card-lifecycle-plan.md`.
