# A replayed turn is not a running turn

**Scope:** transferable

A conversation replayed today from a run held yesterday labelled its turn
**"Working for 3h 20m"**, and the number kept climbing while the reader watched.

## The symptom

Workstream playback re-enacts a conversation by handing the transcript a prefix
of the message list. The turn at the end of that prefix is mid-flight — its
question is drawn, its tool calls have no results yet — which is exactly what a
live turn looks like, so the obvious wiring is to tell `TurnView` it is
`running`. Do that and the turn's label reads `Working for 3h 20m`, then
`3h 21m`, on a replay that started ten seconds ago.

## Why it is misleading

Everything else `running` does is right for a replay. It opens the work
disclosure (`resolveWorkDisclosureOpen`), and it makes a tool call with no result
read as *in progress* rather than as one that never came back
(`resolveToolStepPresentation(state, live)`). Two of the three behaviours behind
the flag are the ones you want, so reusing it looks like reuse rather than a
category error.

The third is a clock, and it is not reading the clock you think it is:

```ts
const elapsed = useElapsed(requestAt ?? watchedFrom, running)
const duration = running || watchedFrom != null ? elapsed : …
```

`requestAt` is `stampedAt(turn.request?.message, 'started_at')` — the agent's own
`TimingMiddleware` stamp, written into `additional_kwargs` and carried through
the checkpointer. It is when the turn **actually happened**, which is the whole
point of it: it survives a refresh, so a reload mid-run picks the stopwatch back
up instead of restarting it from zero. Under a replay it is a timestamp from
yesterday, and `now - requestAt` is the age of the conversation.

`useElapsed` also starts a `setInterval` while `running`, so the wrong number
ticks.

## The check

Before reusing a live-run flag for anything that is not the live stream, grep the
flag's consumers for a clock:

```
rg "useElapsed|watchedFrom|stampedAt|started_at|generated_at" src/app/organizations/**/transcript
```

If any of them derives from a stamp rather than from the flag alone, the flag is
carrying two meanings and the replay needs its own.

## What was done instead

A separate `replaying` prop, threaded `Transcript` → `TurnView` →
`resolveWorkDisclosureOpen` and into `live` on the work segments, and touching
nothing that reads a stamp. The turn keeps the duration it actually took.

It stays true while playback is **paused**, because a paused replay is a frozen
frame of a turn mid-flight, not a turn that finished.

Two smaller traps sit beside it, both silent:

- **`TurnView` is memoised on an explicit comparator.** A new prop left out of it
  is a prop that never takes effect — the turn simply does not re-render when it
  changes. `prev.replaying === next.replaying` is in the list for the same reason
  `prev.revealWork === next.revealWork` already was.
- **The playback bar draws no Framer primitives.** It mounts outside the
  `LazyMotion` that `Transcript` provides, and an `m.*` without a provider above
  it renders at opacity 0 while every `toBeVisible` passes — see
  [an-invisible-panel-passes-to-be-visible](./an-invisible-panel-passes-to-be-visible.md).

## Evidence

- `src/app/organizations/[orgId]/projects/_components/transcript/TurnView.tsx` —
  `useElapsed`, `useWatchedFrom`, `stampedAt`, and the `duration` expression.
- `src/utils/project-onboarding/workDisclosure.ts` — `replaying` sits with
  `running` in the fallback, so an explicit collapse still wins.
- `tests/integration/workstream-actions/workstream-playback-contract.test.ts` —
  *"a replayed turn is not a running turn"* pins `live={running || replaying}`
  and the absence of `running={running || replaying}`, and pins the clock to
  `running` alone.
