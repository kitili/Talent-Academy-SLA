# Clearing one layer of a rule is not clearing the rule

**Scope:** transferable
**Extends:** [`one-rule-many-layers.md`](one-rule-many-layers.md), the general trap; this entry is its
worked case (a cleared blocker read as a completed search) plus the narrowing-widens twist.
**Area:** critical drivetrain rollback; deploy contract, queue, SDF worker,
2026-09-15

## The symptom

A feature plan identified one blocker, cleared it, shipped, and recorded the
phase as complete:

```ts
// src/utils/netsuite/sdfDeployService.ts:76
if (options.operationKind === 'rollback' && !options.desiredStateBindingRequired) {
    throw new Error('A rollback deploy exists only through the strict desired-state chain.')
}
```

That is a real blocker and widening it was necessary. It was also one of
**four** places the same rule lived. Had the rest of the feature been built on
the assumption that the blocker was cleared, the result would have been a
rollback that queues cleanly, returns `200`, shows up as a pending job — and is
failed by a background worker some seconds later with
`deploy_job_drivetrain_binding_required`.

The four:

| Layer | File | What it said |
| --- | --- | --- |
| Payload validator | `sdfDeployContract.ts` | `operationKind !== 'rollback' \|\| desiredStateBindingRequired === true` |
| Queue guard | `sdfDeployService.ts:76` | the throw above |
| Worker ingress | `deployJobIngress.ts:104` | drivetrain payloads must have `initiator === 'build_session'` and `operationKind === 'deploy'` |
| Claim-time session check | `jobStore.ts:280` | `requiresActiveBuildSession = Boolean(payload.drivetrain) \|\| …` |

## Why it was misleading

The plan was not careless — it named the blocker by file and line and explained
it. The trap is that **finding a blocker feels like finding *the* blocker.** A
precise citation reads as a completed search, and the phase was recorded as
"blocker cleared" on the strength of one.

Two of the four were also invisible from the app side. `deployJobIngress.ts` and
`jobStore.ts` live in `workers/sdf-worker/`, which no app-side grep for
`sdfDeployService` reaches. The worker is a separately deployed service, so a
queue that accepts the job is not evidence that anything will run it — see
[`agreement-across-drivetrain-surfaces-is-not-verification.md`](agreement-across-drivetrain-surfaces-is-not-verification.md)
for the same service boundary biting from the other direction.

And the layers do not share wording. "A rollback deploy exists only through the
strict desired-state chain", "it requires an active Build session", and
`desiredStateBindingRequired === true` are three spellings of one rule, so
grepping the message text of the blocker you found returns exactly one hit and
looks conclusive.

## The check

When you find a guard that blocks a feature, **do not grep for the guard. Grep
for the concept, in every service, before estimating the work.**

```bash
grep -rn "operationKind\|operation_kind" --include=*.ts src workers migrations
```

Three questions that would each have found the other three layers:

1. *Who validates this payload besides the function I am editing?* A
   type-guard (`isNetSuiteSdfDeployPayload`) is a layer, and it is the one that
   fails with the least useful message — "the durable payload is invalid" names
   no rule at all.
2. *What happens to this job after it is queued?* Queueing is not executing. A
   guard in the producer says nothing about the consumer.
3. *Does this rule exist in SQL too?* Here it did not, but that is luck rather
   than design — see
   [`one-rule-many-layers.md`](one-rule-many-layers.md).

## The trap underneath: an exemption that widens silently

Layer 4 carried a second, sharper trap. The claim path read:

```ts
if (requiresActiveBuildSession) {
    assertNetSuiteSdfDeployBuildSessionScope({ … })
    if (deployPayload.drivetrain) {
        // …resolve the live target and compare it to the queued one
    }
}
```

Two unrelated questions, nested. The outer one asks *is the session that
approved this still live*; the inner one asks *does the account this job was
queued against still match the process configuration*.

Exempting a rollback from the session — correct, it has none — would have
silently exempted it from the **account check**, because the account check was
inside the session branch. A rollback writes to a live NetSuite account. The
exemption would have removed the one guard that stops it writing to the wrong
one, and nothing in the diff would have said so.

They are now independent, and the independence is pinned by a structural test
rather than left to review, because the failure is invisible:

```ts
// tests/unit/drivetrain/rollbackDeployAuthority.test.ts
const sessionBranchEnd = jobStore.indexOf('if (deployPayload.drivetrain) {')
assert.ok(targetBranch > sessionBranchEnd,
    'the live-target check must sit outside the Build-session branch')
```

**The general shape: when you narrow a condition, check what else was nested
under it.** A guard's blast radius is everything inside its braces, not the
thing it is named after.

## A second instance: the refusal that lived in a shared guard (2026-10-06)

Two approved plans named the layers that kept an ingested field or form off the
drivetrain: the identity key (TypeScript, CHECK, RPC) and two refusals in
`processSplotchCreation.ts`. Lifting all of them would still have refused every
such object, at creation and again at Build, deploy and rollback, with
`not_a_business_process`: the shared mutation guard
(`evaluateNetSuiteProcessMutationRow`) refuses any row whose display kind is not
a process, and every field and form is a Custom Object. It is one helper with
seven callers, so it never appears in a grep for the refusals the plans named.
Found by reading what `assertMutationAllowed` does before writing the new branch,
not by a test. The check above applies: grep for the concept (which rows may be
built), not the refusal codes.

## Evidence

- Blocker cleared 2026-09-14, recorded in
  `plans/drivetrain/critical-drivetrain-rollback-and-script-coverage-plan.md`
  as "Phase 4 — ledger half complete".
- The other three found 2026-09-15 by reading the worker's claim path before
  writing the service, not by grep.
- Each is now pinned in both directions — a drivetrain rollback is admitted
  without a Build session, and a drivetrain *deploy* without one is still
  refused — in `tests/unit/drivetrain/rollbackDeployAuthority.test.ts`, which is
  organised as one `describe` per layer for exactly this reason.
