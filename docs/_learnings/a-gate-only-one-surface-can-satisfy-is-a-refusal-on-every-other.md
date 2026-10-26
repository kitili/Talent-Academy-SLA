# A gate only one surface can satisfy is a refusal on every other

**Scope:** transferable
**Where:** `src/components/builder/DestructiveActionCard.tsx` (the deploy
target gate), `src/app/organizations/[orgId]/projects/_hooks/useAgentRuntimeContext.ts`;
found 2026-09-22 in the sales-order demo workstream.

## What happened

The deploy approval card disables "Yes, run this action" when a
`netsuite_deploy` interrupt has no `target`, and says "Reject this action and
restart Build". The harness copies the target from two runtime-context fields,
`netsuiteConnectionId` and `netsuiteAccountId`. The Build pane sends them. No
other surface did. So a deploy the agent staged from a workstream, with a bound
production connection, a validated build and a route that resolves the
connection server-side from the canvas, reached the card unapprovable, with a
repair ("restart Build") that does not exist on that screen.

The gate was added for a real bug (see
`effect-derived-state-can-miss-a-one-shot-submit.md`): a critical Build once
submitted nulls where its token-bound target should have been. Guarding the
card was right. Nobody asked which other surfaces raise the same interrupt.

## Why it is a trap

- A gate keyed on a context field is only as reachable as the code that sets
  the field. Grep the setters, not the readers: here `netsuiteConnectionId:`
  had two writers, both in the Build pane.
- The message named the one repair the author knew, so on every other surface
  it sent the reader to do something impossible.
- It reads as an environment fault. The agent said "the build is not enabled
  on this project". Nothing was disabled; the field was never sent.
- It was an always-on refusal on the agent deploy path, which the 2026-08-10
  rule forbids (`agent-deploy-path-ungated-until-v1` in memory; demos must
  never be gated from deploying).

## The rule

When a card, route or middleware gates on a runtime-context field, every
surface that can raise the gated action must set the field, and the gate's
message must name a repair that exists on the surface showing it. Here the
project surfaces now put the project's production connection on the context
(`pickProductionConnectionTarget`, the same picker the Build pane's non-critical
fallback uses) and the composer passes the card a message that names binding a
connection rather than restarting a Build.

## How to check for it

- For each `context.<field>` a gate reads, list the components that set it and
  the components that render the gate. Any renderer without a setter is a
  surface where the action can never be approved.
- `tests/integration/workstream-actions/workstream-screen-contract.test.ts` pins
  the hook sends the pair and the composer passes its own message;
  `destructive-approval-contract.test.ts` pins the card keeps the gate and
  takes the message from its host.
