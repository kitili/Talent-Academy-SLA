# Optimistic hide is not a safety mechanism

**Scope:** transferable
**Area:** splotch-agent destructive-action and `ask_question` approvals
**Status:** shipped — destructive retirement, question retirement and recovery
epoch invalidation are on qa and main (8d4c0aba0, 2026-08-30; re-checked
2026-10-04). The 2026-09-15 drivetrain acceptance run approved the production
card on a deployed app, but no recorded browser run checked that an approved
card stays retired after a recovery. Id-less questions keep the best-effort
fingerprint fallback. **The retirement above was the dock's only.** The three
project screens (workstream, onboarding, goal modal) kept the optimistic
fingerprint as their only suppression, and on 2026-10-13 an approved, applied
retire came back there with live buttons (I-22). Designed out 2026-10-14 by a
durable source rather than a better fingerprint: see
[a-head-fetched-on-mount-brings-answered-cards-back.md](a-head-fetched-on-mount-brings-answered-cards-back.md)

## The symptom

A confirmation card for a destructive action — "Push the approved changes to
NetSuite. This applies them to the live account." — stayed on screen after being
approved. It looked like a dead button: click Submit, nothing happens, card
remains.

It was not dead. **The approval had gone through and the deploy had already run
to completion.** The card was inviting a second one.

## Why it was misleading

Everything about the card said "not actioned yet":

- Submit rendered enabled, with a live `onClick`.
- The card's props were correct: `disabled: false`, `onApprove` present,
  `pendingCount: 1`.
- Invoking `onApprove()` directly threw nothing and changed nothing visible.
- The agent, on a resumed run, said *"I'm waiting for the confirmation card
  approval. No further action from me until you approve it."*

Every one of those pointed at "the handler isn't reaching the server". The
opposite was true. The server had accepted the resume, consumed the interrupt,
queued the deploy, and finished it. Only the client was uninformed, because its
stream had died and never learned the interrupt was gone.

The tell was in the job list, not the UI:

```
netsuite_sdf_deploy · completed · "NetSuite SDF deploy complete"
```

**A UI that cannot confirm an action succeeded will happily imply it failed.**

## The trap

The card was hidden after approval by an *optimistic fingerprint*: record the
active interrupt's fingerprint, and render nothing while it matches. Alongside
it sat a reset effect that clears the suppression whenever the active
interrupt's identity changes — reasonable on its own, so a genuinely different
queued request is not swallowed.

Together they mean the suppression is only as durable as the interrupt's
identity. A re-raise, a new id, or a `pendingCount` shift resurrects a card the
user already answered. For a "you have unread messages" banner that is a cosmetic
bug. For a confirmation gating a production write it is a **duplicate-action
hazard**: the UI re-offers an action that already happened, with no indication it
already happened.

Exactly one deploy was created. That was luck — the interrupt was already
consumed server-side — not a guarantee anything in the client provided.

The same lifecycle defect later appeared on an `ask_question` Build approval.
The user cancelled it, the agent acknowledged the cancellation and generated
nothing, but the same card became actionable again. `resumeRun` had cleared the
recovered array; then the raw interrupt disappeared, resetting the optimistic
fingerprint, while an in-flight same-thread checkpoint read restored the
consumed ID. The destructive path already filtered answered IDs. The question
path did not, and neither path's state clearing invalidated that late recovery
write.

## The check

For any confirm-once UI, ask what happens when the confirmation succeeds but the
success is never observed. Optimistic hiding assumes the confirmation round-trips;
resumable runs, dropped streams, and background workers all break that assumption.

```bash
# Suppression that can be undone is suppression that will be undone
grep -rn "setHandled.*Fingerprint\|optimistic" src/components/builder/hooks/
```

The durable form is a **retirement record**: once the user resolves request X,
X never renders again, independent of stream state, identity churn, or
re-delivery. Keep it keyed to something that cannot collide with a genuinely new
request — an id, not a value hash. Two identical requests are indistinguishable
by value, and silently swallowing the second confirmation is a worse failure
than showing one twice.

Retire the id **before** dispatching the resume, not after it succeeds. The
window between the two is exactly where a re-render re-offers the card.

That pre-dispatch retirement records a local **attempt**, not proof that the
server consumed the interrupt. If the transport fails before the request
reaches LangGraph, the same question can remain pending authoritatively while
the mounted client has retired it. Do not retry the answer automatically and
do not undo retirement merely because `fetch` failed: the outcome may be
ambiguous. After `runs.list` proves the thread has settled, reconcile against
`Thread.interrupts`. Only the exact ID-bearing `ask_question` that authority
still reports pending may be released and presented for an explicit retry.
Authoritative absence keeps it retired. Destructive approvals need a separate
side-effect audit because re-presenting them after an ambiguous response could
repeat an external write.

Also invalidate asynchronous recovery before dispatching the resume. Clearing
rendered recovery state does not cancel an in-flight same-thread read. A
thread-id guard protects a thread switch; a monotonically advancing recovery
epoch protects lifecycle boundaries inside the same thread. A result may write
only when both the captured thread and epoch are still current.

A remount loses the in-memory retirement set, so cold hydration must audit the
authoritative checkpoint even when SDK replay already offers a card. Withhold
the card immediately, including while history loads. Each attempt must first
prove through `runs.list` that no run is `running` or `pending`; otherwise an
early empty snapshot can suppress an approval the run is still about to raise.
A settled authoritative empty removes a consumed replay, while total bounded
failure fails open rather than hiding a real approval forever. Rising
reconnect/live state invalidates early authority, and settlement re-audits.
When combining SDK accessors, preserve different keyed siblings even if their
payloads are identical; an ID, not wording, defines the one-shot request.

## Do not read "nothing visible happened" as "nothing happened"

The generalisable habit: when a destructive action's UI is ambiguous, check the
side effect directly — the job table, the audit row, the target system — before
concluding it did not fire. In this incident the absence of a deploy job was
checked *before* the successful approval and never re-checked afterwards, so
"nothing has been deployed" was reported after it was no longer true.

## Related

- `docs/splotch-agent/architecture.md` — "An answered interrupt is retired by
  id, not merely hidden"
- [hydrating-a-transcript-is-not-restoring-a-run.md](hydrating-a-transcript-is-not-restoring-a-run.md)
  — the dead stream that made the client unable to observe the resolution
- `tests/unit/splotch-agent/answeredDestructiveInterrupts.test.ts`
- `tests/unit/splotch-agent/answeredAskQuestionInterrupts.test.ts`
- `tests/unit/splotch-agent/pendingInterruptRecovery.test.ts`
