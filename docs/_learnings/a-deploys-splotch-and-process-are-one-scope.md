# A deploy's Splotch and process are one scope

**Scope:** transferable
**Area:** `POST /api/netsuite/deploy`, the deployment-occurrence ledger, the agent skills that
stage a deploy by hand (Mode B), and any route that queues work a later stage validates.
**Status:** designed out for the pairing on 2026-09-28 (`plans/drivetrain/workstream-build-plan.md`,
Phase 3): the route refuses a mismatched pair before queueing. Designed out for the Business Logic
Map's splotch generation on 2026-10-09 (second instance, below). The general trap, a route or a UI
that queues what a later stage refuses, is still open anywhere else it occurs.

## The symptom

A workstream asked Inky to convert two ingested SuiteScript 2.1 scripts to 2.0 and deploy them
(`chats/suitescript2.0_migration.md`). The code was right. Three deploys were queued, and all
three failed in the SDF worker minutes later with the same message:

> Deploy occurrence splotch is outside the queued canvas/process scope

The last attempt had one file, the matching process and the matching canvas, and still failed.
The agent concluded it needed "a server-issued scope token" and stopped.

## Why it was misleading

- **The route said yes.** `/api/netsuite/deploy` accepted the request and returned a `jobId`, so
  the request looked well formed. The refusal came from `prepare_deployment_occurrence_v1`
  (`migrations/drivetrain-prod/01_occurrence_ledger_core.up.sql:625`), which runs in the worker,
  after queueing. It refuses a named Splotch whose `process_id` differs from the queued process,
  **NULL included**.
- **The Splotch was the agent's own, hand-drawn one.** Its `process_id` was NULL, so no process id
  could ever satisfy the ledger. Narrowing the package was the natural response and could never
  work, because the problem was not in the package.
- **The only deployable shape was out of reach.** The `create-splotches` skill told the agent to
  leave `process_id` unset: a process-backed Splotch was "the ingestion pipeline's business". The
  Splotch that could deploy, a drivetrain Splotch linked to the process, was one the agent was
  forbidden to create.
- **And that Splotch needs a Build admission** that, until 2026-09-28, only the Build pane could
  mint as a bearer token. A workstream has a cookie and no token.

So the three layers each looked reasonable alone: the route queued, the skill kept the agent out
of the pipeline's rows, and the ledger kept the ledger consistent. Together they made the task
impossible, and the only error arrived last, from the layer furthest from the cause.

## The check

- **A route that queues work should refuse, before queueing, anything the next stage will refuse
  from the same inputs.** The route now runs `checkSplotchProcessPairing`
  (`src/utils/drivetrain/deployAdmission.ts`), the same comparison the ledger makes, NULL included,
  and returns `splotch_process_mismatch` with a remediation. The ledger keeps its check, since
  the route is not the only writer. To find the next instance, read the `RAISE EXCEPTION` lines in
  the RPCs a worker calls (`grep -n "RAISE EXCEPTION" migrations/drivetrain-prod/*.sql`) and ask of
  each one whether the enqueueing route already knows everything it compares.
- **Before telling an agent not to create something, check that the thing it needs is reachable
  another way.** If a skill forbids a row shape, name the tool that makes it. Here that is
  `create_process_splotch` (`POST /api/processes/{processId}/splotch`).
- **A gate only one surface can satisfy is a refusal on every other surface.** See
  `a-gate-only-one-surface-can-satisfy-is-a-refusal-on-every-other.md`. The workstream now admits
  a Build itself (`start_build`), and the deploy route accepts a cookie plus that admission's id.

## Second instance: a UI that offers what the worker refuses (2026-10-09)

The Business Logic Map's Expand in place offered "Generate 86 splotches for this function?" on
"Audit Readiness Health Check"'s Credit & Collections, and the population job then skipped all but
about 2. The client chose by shape (script or workflow); each splotch is created by
`createProcessSplotch`, which refuses catalog-only entries and anything
`evaluateNetSuiteProcessMutationRow` rejects (not display kind `process`, or an installed-package
component). Account-wide, only 24 of 920 scripts and 4 of 39 workflows pass: 878 scripts were an
installed SuiteBundle's metadata-only rows. Every refusal was "correct", and the user saw a promise
of 86 diagrams.

The fix is the same rule: the client now runs the server's predicates
(`isNetSuitePackageOwnedProcess`, `isNetSuiteCatalogProcess`, `classifyNetSuiteProcessDisplayKind`,
together `isSelectableNetSuiteProcess` plus the catalog refusal) over **the same row fields the
server reads** (`splotchIneligibility` in `src/utils/canvas/businessLogicMap.ts`). Two details that
decide whether a client copy is really the same rule:
- **Feed it the server's input, not the client's richer row.** The browser row carries a
  `display_kind` annotation and a `process_kind` the server never reads; passing them would make the
  client classify differently. And the client's own view dropped `bucket_name`, which the legacy
  "Catalog:" check needs, so a catalog row read as a process until it was passed through.
- **Check the payload actually has the fields.** The map payload projects `parsed_sdf_data`; the
  projection is a denylist of saved-search keys only, and a probe compares `selectable` row by row.

Tests: `tests/unit/canvas/businessLogicMap.test.ts` asserts the BLM's answer equals
`isSelectableNetSuiteProcess` on six measured shapes.

## Evidence

- Trace: `chats/suitescript2.0_migration.md`, around lines 3569, 3670 and 3982 (the three refusals)
  and 3352 (the hand-written manifest pairing Splotch `a52aa4ed…`, `process_id` NULL, with process
  `85f8c623…`).
- Tests: `tests/unit/drivetrain/deployPairing.test.ts` pins the refusal, starting with the trace's
  NULL case, accepts exactly what the ledger accepts, and checks that the route runs the pairing
  before its `queueNetSuiteSdfDeployJob` call.
