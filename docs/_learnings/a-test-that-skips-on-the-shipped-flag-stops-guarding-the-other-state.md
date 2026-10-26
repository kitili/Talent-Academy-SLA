# A test that skips on the shipped flag stops guarding the other state

**Scope:** transferable
**Area:** feature switches read as module constants; `tests/unit/mcp/decideAuthorization.test.ts`,
`src/utils/mcp/oauth/decideAuthorization.ts`
**Status:** fixed for the MCP source scope on 2026-10-06 (`build/mcp-source-tool-on`)

## The symptom

Turning `MCP_NETSUITE_SOURCE_TOOL_ENABLED` on would have left the suite green: the test "refuses
splotch:netsuite:source as unsupported while the source tool is off, and issues no code" does not fail
with the switch on, it skips. (Found by reading the test before the flip, not by running it after.) It was
written while the switch was off, as the proof that the consent decision refuses the scope:

```ts
if (MCP_NETSUITE_SOURCE_TOOL_ENABLED) {
    context.skip('the source tool is switched on')
    return
}
```

## Why it was misleading

The switch is kept as an off-switch, and the test reads like the proof that switching it off still works.
It was only ever that proof while the switch was off. Once the shipped value changed, the off state had
no test, and a skip does not fail anything.

## Why it happens

The decision read the supported list straight from a module constant (`MCP_SUPPORTED_SCOPES`, built from
the switch at import time), so a test could only see the state the code shipped in. Skipping on the flag
is the natural way to write a test for a state it cannot reach. It records that the state exists but does
not test it.

## What to do

- A switch that must work both ways needs a test of both states that runs in either shipped state. Make
  the switched value injectable at the function under test. Here `AuthorizationDecisionDeps` gained
  `supportedScopes` (production default `MCP_SUPPORTED_SCOPES`), and the off test passes
  `mcpSupportedScopes(false)`.
- Pin the shipped state separately, with a test that asserts the flag's value, so flipping it is a
  deliberate edit to a test, not a silent skip.
- After flipping any flag, compare the skip count before and after. A new skip is a test that stopped
  running.
