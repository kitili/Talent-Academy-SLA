# A live card under a replay reads as part of the replay

**Scope:** transferable
**Area:** workstream playback and the interrupt cards (`ask_question`,
`choose_connection`, `choose_description_scope`, `destructive_action`). Found
2026-09-30 while planning to replay those cards. **Designed out the same day**
for the workstream screen: `ConversationComposer` withholds live cards while
`replay.active`.

## The symptom

Playback re-enacts a workstream from its first turn. Start it on a thread that
is suspended on an approval, and while the transcript replays turn 3, the
composer slot under it still shows the **live** card for the approval at the
end: *"Are you sure? Push the approved changes to NetSuite."*, with
**Yes, run this action** enabled. Press it and the real deploy approval is
resumed. The replay carries on at turn 3, and nothing on screen says a real run
has started. On 2026-09-30, 14 of the 114 most recent workstream and onboarding
threads were suspended on a card, so this was the ordinary case, not an edge one.

## Why it was misleading

Playback was built as "one truncated message list, threaded everywhere the full
one goes", and pinned by a contract that every derived surface reads the
playback list. The interrupt cards are not derived from the message list. They
are drawn from `stream.interrupt`, `stream.interrupts` and `settledInterrupts`
through four hooks, which answer for the thread **as it is now**. The contract
that no surface was left on the full list could not see them, because they were
never on any list.

The guarantee in the docs (*"playback writes nothing, starts no run"*) was true
of playback, and so it read as true of the screen during playback. It was not:

- The card was answerable, with `disabled={control.isRunning}` only.
- Answering goes through `stream.submit(null, { command: { resume } })` inside
  the hook. That bypasses `useAgentRunControl`'s `onDispatch`, which is the only
  thing that stops playback when the reader sends. So the documented rule
  (sending stops a playback) did not apply to answering a card.
- `describePlaybackDisabled` refuses a live **run**. A suspended thread is not
  running, so playback starts over it without complaint.

It was not an authorization gap. It was the genuinely pending interrupt, with
the reader's own session and every server check intact. It was a **consent**
gap: an irreversible approval shown out of context, under a replay, looking like
part of it. Replaying past cards in the same slot would have made the live one
indistinguishable from them.

## The check

When a view re-enacts or previews a conversation, list every surface on that
screen that is **not** derived from the list being re-enacted, and decide what
each should do during the view:

```
rg "stream\.(interrupt|interrupts|settledInterrupts)|useAskQuestion|useChooseConnection|useDestructiveApproval|useChooseDescriptionScope" src/app
```

Anything that can act (a card, a composer, a menu action) either stops the view
when used or is withheld during it. A view guarantee ("writes nothing") covers
only what the view draws. Say which surfaces it covers.

## What was done

- `ConversationComposer` takes `replay`. While it is active no live card is
  drawn. If one is pending, `PlaybackInterruptNotice` stands in its place, and
  its only control is Stop. Stop brings the live card back.
- Replayed cards take `answeredWith`, and their props forbid a callback beside
  it (checked by `tsc` with `@ts-expect-error` in `replayedCards.test.ts`). The
  host, `ReplayedInterruptCard`, takes no binding. The description scope
  replays inline, not as the live `Dialog`, whose every close path
  (`onOpenChange(false)`) is a resume.
- `tests/browser-fixtures/workstream-playback-cards.spec.ts` counts what reaches
  the live binding and every write the page issues during a replay: both are
  zero.

## Evidence

- `src/app/organizations/[orgId]/projects/_components/ConversationComposer.tsx`:
  the `replay` branch, ahead of every live card.
- `src/app/organizations/[orgId]/projects/_hooks/useAskQuestion.ts`: the resume
  is `stream.submit` directly. The other three hooks resume the same way.
- `src/utils/workstreams/playback.ts`: `describePlaybackDisabled` checks
  `isRunning`, not a pending interrupt.
- `plans/workstream-actions/playback-input-cards-plan.md`, Evidence §4.
