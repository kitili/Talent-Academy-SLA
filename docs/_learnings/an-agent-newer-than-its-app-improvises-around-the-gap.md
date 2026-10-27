# An agent newer than its app improvises around the gap

**Scope:** transferable
**Area:** the LangGraph harness and the Next app it calls through `API_BASE_URL`; every harness tool
with a fixed app route; the deploy order written into plans.
**Status:** designed out for capability-declaring tools on 2026-09-29
(`plans/workstream-actions/agent-build-trace-fixes-plan.md`, D6 and D7). Still open for any tool that
declares no capability, and for a new route whose id nobody added to `src/constants/agentCapabilities.ts`.

## The symptom

A workstream asked the agent to convert two ingested SuiteScript 2.1 scripts to 2.0 and deploy them
(`chats/suitescript2.0_migration2.md`, 2026-09-28 22:44). The harness offered `create_process_splotch`
and `start_build`. Every call came back as:

> [create_process_splotch] POST /api/processes/85f8c623-…/splotch → HTTP 404. (HTML error page, not an
> API response — this path is not an API route.)

The combined impact route (`POST /api/processes/impact-context`) answered the same way. The agent read
it as "needs canvas context" and retried twice, then wrote *"I'll fall back to **Path B**"*, a path the
playbook reserves for new customizations. It drew nothing, and later told the user *"I drew the as-is
directly from the ingested source"*.

## Why it was misleading

- **The harness had the tools, the app did not have the routes.** The routes were on `qa` and on
  `fix/drivetrain` (`09ea05baa`); the app behind that harness's `API_BASE_URL` predated them. Nothing
  was broken in either codebase.
- **The error blamed the path.** "This path is not an API route" is right for the generic verbs, whose
  path the model chose. For a tool with a fixed route it pointed the model at its own arguments, so it
  looked for a missing field instead of a missing deployment.
- **Deploy order was the only guard, and it was a checklist.** The workstream-build plan said to ship
  the app first, because "new harness with old app: the new tools would get 404s. Hence the order."
  `AGENT_HARNESS_EXCLUDED_TOOLS` is read once when the worker starts and cannot react to the app.
- **It had happened before, and was written down only in memory.** Send to Inky's first run failed the
  same way: the staging agent's `API_BASE_URL` pointed at a deployment without the edit route.
- **A model with a skill and no tool improvises.** The playbook named two paths, so a failing path
  looked like a reason to take the other one. See
  [a-skill-step-the-tools-cannot-do-gets-narrated-as-done](./a-skill-step-the-tools-cannot-do-gets-narrated-as-done.md).

## The check

- **A tool that needs an app route declares it.** `declare_capability(tool, "<id>")` in the harness,
  and the id with its routes in `AGENT_CAPABILITIES` (`src/constants/agentCapabilities.ts`) in the same
  change as the route. The app serves the list at `GET /api/agent-capabilities`; the tool-surface
  middleware hides a declaring tool the list lacks, and every declaring tool when the route 404s.
  `tests/unit/splotch-agent/agentCapabilities.test.ts` fails when a named route file is missing or a
  harness tool declares an id the app never lists.
- **A fixed-route tool names the skew.** Pass `own_route=True` to `execute_request`; an HTML 404 then
  reads *"This Splotch deployment does not have this feature yet (the agent is newer than the app). Stop
  and tell the user; do not work around it."*
- **The skill says what a failure means.** `build-customization` stops and asks when a Path A tool fails
  or is missing, and never relabels the work.
- **Before a live run,** read `GET <app>/api/agent-capabilities` for the app the harness will call, and
  compare it with the tools the run needs. A 404 there means the harness is ahead.

## Evidence

- Trace: `chats/suitescript2.0_migration2.md`, lines 1480 and 1508 (the impact route), 2114–2173 (four
  `create_process_splotch` 404s), 2180 (the switch to Path B) and 2697 (the claim to have drawn it).
- The route landed in `09ea05baa` and reached `qa` at 22:24 through PR #2136, twenty minutes before the
  run; `origin/main` lacked both routes. That the app behind the run's `API_BASE_URL` was one without
  them is the plan's assumption (the 404 bodies were Next's own page, not a route's JSON refusal); no
  deployment log was read.
- Tests: `workers/agent-harness/tests/unit/test_tool_capabilities.py`,
  `test_api_error_body.py`, `test_create_process_splotch_tool.py`, `test_start_build_tool.py`.

## Update 2026-10-14: a parameter skews like a route

The capability ids guard a *tool* that needs a route. They cannot guard a new *parameter* of a route that exists:
the SI test run's fix lets `GET /api/netsuite/configs` (and three siblings) take `canvasId`, and the process schema
route take `recordType`, through the generic `read` tool. A harness (or a skill) ahead of the app sends `canvasId` and
meets `400 codeId is required`, or sends `recordType` and is silently handed the whole 17 MB inventory. No
capability id was added (nothing new to hide); the guard is the deploy order in
`plans/splotch-agent/agent-tool-contracts-plan.md`: the app, then the harness, then the skill text that asks for the
new parameter.
