# Effect-derived state can miss a one-shot submit

**Scope:** transferable
**Area:** Build-with-Splotch runtime context
**Status:** designed out for the critical drivetrain

## Symptom

A critical Build had the correct NetSuite account and connection on its active
Build-session token and in its staged manifest, but the deployment approval said:

```text
Deployment target unavailable. Reject this action and restart Build.
```

The browser diagnostic listed `netsuiteConnectionId` and `netsuiteAccountId`
among the context keys, and the current agent harness contained the code that
adds those values to the destructive interrupt.

## Why it was misleading

The keys were present with null values. The authoritative Build auth and the
pending one-shot seed were published together, while `BuildPaneContainer`
copied the target into a second state variable from a passive effect. The child
seed effect could start the LangGraph invocation before that copy caused a
second render.

The database, token minting, manifest, and harness were all correct. The stale
projection was the producer of the bad invocation. Runtime context is scoped to
that invocation, so a later render could not repair the interrupt it created.

## The check

When an effect-derived value feeds a one-shot action, compare when each becomes
visible:

```text
authoritative provider state update
  + pending one-shot work update
  -> render
  -> child effect submits
  -> parent effect copies provider state into derived state
  -> later render (too late)
```

Do not treat a list of object keys as evidence that required values are
non-null. Test the first submitted payload, not only the settled component
state.

## The fix

The critical runtime target is now projected synchronously from the current
matching Build-session auth. The asynchronously loaded connection state remains
only a non-critical fallback. Critical seed publication, manual submission, and
interrupt approval also wait for a complete exact token envelope.

Behavioral coverage lives in
`tests/unit/drivetrain/runtimeDeployTarget.test.ts`; the browser wiring contract
is in `tests/integration/splotch-agent/client-contract.test.ts`; and the harness
test validates camelCase browser context through the real Pydantic `Context`
model before formatting the interrupt.

## Related

- [a-visible-account-is-not-deployment-authority.md](a-visible-account-is-not-deployment-authority.md)
- `src/utils/drivetrain/runtimeDeployTarget.ts`
- `src/components/builder/BuildPaneContainer.tsx`
- `src/hooks/useBuildWithSplotchSeed.ts`
