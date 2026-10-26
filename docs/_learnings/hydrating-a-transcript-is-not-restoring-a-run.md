# Hydrating a transcript is not restoring a run

**Scope:** transferable
**Area:** splotch-agent stream rejoin, LangGraph interrupts
**Status:** shipped — interrupt discovery and the consumed-interrupt lifecycle
correction are in `useDriverAgentStream.ts` on qa and main (re-checked 2026-10-04).
Deployed approvals worked end to end in the 2026-09-15 drivetrain acceptance run,
but no recorded browser run has rejoined a paused thread after a reload

## The symptom

A destructive action — `netsuite_deploy` — could not be approved. The chat
looked completely healthy: full transcript, correct history, composer live, no
error toast. The approve/reject card simply never appeared, so the run sat
paused forever. Sending any message produced:

```
Tool call 'netsuite_deploy' was cancelled before its result was recorded.
Do not assume it succeeded; retry only if the result is still needed.
```

which reads like the tool failed. It had not run at all.

## Why it was misleading

Every individual layer was behaving correctly, and said so:

- `DestructiveActionMiddleware` paused *before* the tool — the reason NetSuite
  was never touched.
- The rejoin failure was correctly classified as
  `isUnreplayableStreamError` and deliberately **not** reported: the handler's
  comment says *"The thread and its checkpointed state are fine — do NOT wipe
  them"*, which is true.
- Falling back to history hydration rendered the transcript perfectly.
- `ToolCallRepairMiddleware` swept the dangling call exactly as designed.

So there was no error to chase, and the one comment a reader would land on
actively reassures them that the state is intact. The bug lives in the gap
between *"the transcript is intact"* and *"the run is answerable"*.

## The trap

`onDisconnect: 'continue'` means a dropped stream does not end the run. The run
keeps executing server-side, and if it is paused on an interrupt it can only be
unblocked by the client. But the client derived its pending interrupts solely
from the live stream:

```ts
const interrupts = useMemo(() => stream.interrupts ?? [] /* + stream.interrupt */, [...])
```

No stream, no interrupts, no card — even though the server was holding one and
the thread's state contained it.

**Restoring what the user can read is not the same as restoring what the user
can do.** Hydration was written to answer "what happened?", and quietly became
the recovery path for "what is being asked of me right now?", which it never
covered.

## What triggers it

The run's event cache is bounded and **a redeploy drops it**. So the reliable
repro is: start a build, deploy the app or the agent while it runs, then reach a
destructive action. That is not exotic — it is a normal Tuesday for anyone
shipping fixes while testing them, which is exactly how it was found.

## The check

When a recovery path exists for a dropped connection, enumerate what the live
stream was the *only* source of, not just what the user sees:

```bash
# Anything derived from the stream object alone is a recovery candidate
grep -n "stream\.\(interrupt\|interrupts\|values\|error\)" src/components/builder/hooks/
```

For each, ask: if this connection never comes back, is the server holding state
the user must act on? Transcript, yes — already handled. Interrupts, yes — this
bug. Run status, no — idle is correct.

## Leaving it better

Recover from the authority that survived, not from the thing that died. The
thread's checkpointed state held the interrupt the whole time, so
`recoverPendingInterrupts` reads `client.threads.get(threadId).interrupts`.
Ordinary recovery merges pending entries behind the live set. Cold hydration is
different: cards on an unaudited existing thread are withheld even while
history loads. Each bounded attempt first lists runs and accepts the checkpoint
only when none is `running` or `pending`; an empty snapshot taken before the run
settles is not authority. The settled checkpoint is authoritative even when SDK
replay already shows a card, and even when the successful snapshot is empty.
Exhausting every attempt fails open to the SDK live/recovered set. Distinct
keyed siblings survive even when their payloads are identical. Value dedupe is
only the compatibility fallback when either SDK accessor omits an ID.

Clearing that array is necessary, but it is not a safety boundary. A
same-thread checkpoint read that started before resume can resolve afterwards
and repopulate the already-consumed interrupt. A thread-id guard catches only
conversation A painting into conversation B; a recovery epoch also separates
lifecycle A1 from A2 within the same thread. Every recovery read captures both
the thread and epoch, and resume, a new submit, explicit lifecycle rejoin,
rising SDK reconnect/live state, new chat, and thread switch invalidate the
epoch before late state can be written. Active discovery re-audits after the
run settles. Recovered and audit state is cleared at those boundaries as
cleanup. ID-bearing `ask_question` and destructive interrupts are also retired
before resume. An id-less question keeps fingerprint suppression as a
best-effort fallback because two identical id-less questions cannot be
distinguished safely.

Do not key this only to one memorable error string. A later staging run paused
correctly on Build approval after ordinary connection/reconnect failures; the
server thread was `interrupted` while the persisted chat mirror said `idle` and
the browser showed only the report. Recovery must cover errored settlement and
every failed rejoin. Cold hydration must audit every existing visible thread,
not only one with no replayed card: replay proves what the SDK remembered,
while a settled `Thread.interrupts` snapshot proves what is pending now. Only a
thread genuinely minted by the current tab's live submit may skip this check;
`onThreadId` also fires for selected existing threads and is not mint evidence.
If an initial request was
accepted but its response lost the run id, active-run discovery must rerun when
streaming falls false. Async recovery also needs a thread-id guard so an old
fetch cannot paint its card into a newly selected chat, plus a recovery epoch
so an old fetch cannot paint a consumed card back into the same chat.

Do not mark a cold audit complete before the network read succeeds. That turns
one transient failure into a permanent session-local suppression. The recovery
policy retries a bounded three times and records authoritative completion only
after a successful settled read. If all attempts fail it records failure and
exposes the SDK state; thread, epoch, reconnect, or rejoin changes cancel
obsolete attempts. Failed rejoin uses this same bounded audit rather than a
one-shot checkpoint read.

Best-effort by construction: a successful empty authority can remove a stale
card, but a failed audit cannot permanently hide a real one. A recovery path
should not be able to make things worse than the failure it is recovering from.

## Related

- `docs/splotch-agent/architecture.md` — "A pending interrupt survives a stream
  that cannot be rejoined", and the keyed-resume contract next to it
- `src/components/builder/hooks/agentStreamError.ts` — why the replay failure is
  benign, and why the thread must not be wiped
- `tests/unit/splotch-agent/pendingInterruptRecovery.test.ts`
- `tests/unit/splotch-agent/answeredAskQuestionInterrupts.test.ts`
