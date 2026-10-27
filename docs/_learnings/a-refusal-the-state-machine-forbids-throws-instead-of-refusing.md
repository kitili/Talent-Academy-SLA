# A refusal the state machine forbids throws instead of refusing

**Scope:** transferable
**Area:** the NetSuite configuration-change lifecycle (`requestLifecycle.ts`), the apply route's admission refusal;
found 2026-10-08 while adding structural record writes.

## The symptom

None yet, which is the trap. The apply route records the approval (`awaiting_approval -> queued`), then checks
admission, and on a refusal writes `queued -> blocked` with an `admission_refused` event. The transition table did not
allow `queued -> blocked`. `transitionConfigChangeRequest` asserts every transition, so the refusal would have thrown
"Invalid configuration request transition: queued -> blocked", the route would have answered 500, and the request
would have sat `queued` with an approval and no job: the opposite of the clean "approved, recorded, writes are off"
answer the code was written to give.

It never fired because feature writes have been on since the path shipped, so admission never refused after an
approval. The first flag to be turned off in an incident would have found it.

## Why it is misleading

The refusal path reads correctly, in one file. The rule that breaks it lives in another (`TRANSITIONS`), and both
pass their own tests: the table's tests check the transitions it has, and nothing ran the route with a flag off. A
guard that is only ever exercised when something is switched off is exactly the one that gets no traffic until the day
it matters.

## The check

For every `transition...({ to: X })` on an error or refusal path, find the state the request is in at that line and
check `canTransition(from, X)` in a test. Better: run the refusal path once with its flag off.

## Evidence

Fixed 2026-10-08 by allowing `queued -> blocked` (`requestLifecycle.ts`), which structural record writes also need
for their `log` mode; pinned in `tests/unit/netsuite-configuration-write/requestLifecycle.test.ts`. The same change
added `applying -> conflict` for a record whose live state moved before the worker sent anything.
