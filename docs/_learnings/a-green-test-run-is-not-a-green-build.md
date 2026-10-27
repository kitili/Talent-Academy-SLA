# A green test run is not a green build

**Scope:** transferable
**Where:** any change to a typed constant the tests import, here `PROD_AGENT_MODEL_NAME` in
`src/constants/constants.ts`. Found 2026-09-23 on `fix/drivetrain`.

## The symptom

```text
./src/agent-client/llm/environmentModel.ts:21:14
Type error: Type '"claude-opus-5-5"' is not assignable to type 'AgentModelId'. Did you mean '"claude-opus-5"'?
Next.js build worker exited with code: 1
```

Every Vercel build of the branch failed from the commit that moved the production agent model to
`claude-opus-5-5` (`c00a921c5`), through five more pushes, while `yarn test` reported only five
failing assertions that pinned the old model name.

## Why it was misleading

The test runner loads TypeScript through `tsx`, which strips types without checking them, so every
test that imports `environmentModel.ts` ran. The type error surfaced only in `yarn typecheck` and in
`next build`, which type-checks before it bundles. The five failures read as stale pins to update,
not as a broken build, and `yarn typecheck`'s two errors sat in a file nobody had edited.

Worse, the type was the only alarm. The agent harness swaps a model id it does not list for its
default (Kimi K3) without an error, so had the type been loosened to make the build pass, production
would have run on Kimi.

## The check

- Treat a `yarn typecheck` error as a broken deploy, whichever file it names, and run it before every
  push; `yarn test` cannot see it.
- A model moves in five places together: `AgentModelId` and `MODEL_REGISTRY` in the app; in the
  harness, `SupportedModel` (with its context window), `COMPUTER_USE_VARIANTS` and the billing rate
  card.

## Status

Partly designed out: `constants.ts` declares the policy ids `satisfies AgentModelId`, so the next
change fails the build at the line being edited.

The harness half was designed out on 2026-09-30, and not by failing the run. The product rule is
that production never fails on a model id.

- **Unregistered id.** `resolve_model_id` (`workers/agent-harness/src/context/context.py`) moves a
  run that names an unregistered model to its provider's production-grade model
  (`PROVIDER_FALLBACK_MODELS`). An unknown `claude-*` id runs the production Opus, not Kimi K3.
- **Where the fallback shows.**
  - It logs `[model-fallback] requested … running …` at error level in the harness logs.
  - It tags the model node's trace `model_fallback: {requested, used}`, which
    `scripts/langsmith/` counts.
- **Keeping the mirror honest.** The Anthropic entry mirrors `PROD_AGENT_MODEL_NAME`.
  `tests/integration/splotch-agent/client-contract.test.ts` fails when they disagree, so moving
  production moves the fallback with it.
- **What still happens silently.** An id with no recognisable provider, or no id at all, still
  runs `DEFAULT_MODEL` (Kimi K3).
- **What remains of the trap.** A fallback is still a fallback: a run on the wrong model
  succeeds. The alarm is now the error log and the trace tag, not the bill.

The traces that motivated this (2026-09-28, `claude-sonnet-5-5` before it was registered) are in
`plans/splotch-agent/langsmith-trace-review-plan.md` §6.

## A second case: typed fixtures after a merge (2026-10-23)

Two sibling branches of the action plan summary met: the board (T6) built typed fixtures of `ActionSummaryData` in
three files (a browser fixture page and two unit tests), and the server side (T4b) added the required fields
`outOfScope`, `evidence` and `retest` to that type. Every test still ran, because `tsx` strips types, so the suite
was green while `tsc` failed on all three literals. The same nine-line fix was needed twice, once on the worker's
branch (`7c196b52c`) and once on the merge (`e680213ba`), and it was found only because the worker ran
`yarn typecheck` after merging.

- After merging a branch that extends a contract, run `yarn typecheck` before anything else; the failure will be in
  files neither branch edited.
- A fixture literal typed against a contract breaks on every required field a sibling adds. Build a fixture from one
  shared factory (three of the board's tests now share `tests/unit/live-report/_fixtures/actionSummaryBoardKit.ts`; the follow and download tests and the fixture page still hold their own literals), so the next
  field is added once.

Related: [one-rule-many-layers.md](one-rule-many-layers.md)
