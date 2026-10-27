# A comment above a gate is not a bypass

**Scope:** transferable
**Area:** MCP read route, `src/app/api/mcp/canvases/[canvasId]/[tool]/route.ts`; found 2026-09-18 while documenting the surface. **Status:** the MCP instance was designed out on 2026-10-05 (`plans/mcp/mcp-onboarding-connect-parity-plan.md`, Task A); the trap stays open for any other route that comments a bypass.

## The symptom

Nothing crashed and nobody reported it. Three places agreed that the four project tools (`project_overview`, `list_sections`, `list_workstreams`, `get_workstream`) answer for a project with nothing ingested:

| Where | What it said |
| --- | --- |
| The comment above `PROJECT_TOOLS` in the route | "do NOT inherit the ingestion gate: a project with no ingested repository still has a name, sections and a plan" |
| `workers/splotch-mcp/README.md` | "they deliberately sit **in front of** the ingestion gate the graph tools sit behind" |
| `test_the_project_tools_do_not_promise_an_ingested_repository` | passes |

The route does this, in order:

```ts
const scope = await resolveCanvasScope(canvasId, auth.claims.userId)
if (isCanvasScopeRejection(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status })
// ...
if (isProjectTool(tool)) return projectTool(tool, { ... })
```

and `resolveCanvasScope` answers `{ ok: false, reason: 'no-code', status: 404 }` when the canvas has no `code` row. A `code` row is written only by ingestion. So a freshly created project answers every project tool with "This project has no ingested repository, so it has no system map yet." The onboarding bindings poll `project_overview` for `netsuite.connections` and `netsuite.ingestion.status` on exactly such a project.

## Why it was misleading

- **The comment described the design, and the design was right.** It sits directly above the constant that names the tools, reads as documentation of the branch below, and the branch below does exist. What it does not say is where the branch is relative to the gate, and the gate is a function call whose name says nothing about ingestion.
- **The service function was tested for the very case.** `readProjectOverview` "reports a project with no ingested code as having no repository" and passes, because it is called with an admin client and a canvas id and never sees the route. Green tests on the layer below the gate say nothing about whether the gate lets a call reach it.
- **The service test pinned words, not behaviour.** It asserts substrings of tool *descriptions*. That is a real test of a real thing (a model reads those descriptions), and its name reads like a behavioural guarantee.
- **The README was written from the intent.** It restates the comment in more detail and with more confidence.

## How the MCP instance was designed out (2026-10-05)

- The resolver was split: `resolveCanvasMembership` is the half the project tools need, and `resolveCanvasScope` calls it before its repository lookups. No second copy of the membership check was written.
- The route answers the project tools **first**, through `answerMcpProjectTool` (`src/services/mcp/projectTools.ts`), before `resolveCanvasScope` is ever called. `create_workstream` uses the same gate.
- The comment above `PROJECT_TOOLS` now names the test that fails if the branch moves back: `tests/unit/mcp/mcpProjectToolGate.test.ts` drives the whole answer (gate included) against the two-organization fixture with no `code` row, and pins the branch order in the route. Moving the branch behind `resolveCanvasScope` was mutation-checked and fails it.

## The check

When a comment says a code path skips, bypasses, or sits in front of a check, find the check as a call and confirm the branch is textually before it. Then ask what the layers of test cover: a service function tested in isolation proves nothing about the route that may never reach it. For a route, the cheapest proof is a route-level test with the gate's failure injected (`resolveCanvasScope` returning `no-code`) and the tool's success asserted.

The same shape as `a-test-that-reads-source-as-text-cannot-guard-a-move.md`: a test that asserts text will pass across any change to behaviour.

## Related

- `docs/mcp/future-improvements.md` — the defect, its consequences for onboarding, and the fix.
- `docs/mcp/test-suite.md` — the missing route-level case.
- `a-test-that-reads-source-as-text-cannot-guard-a-move.md` — the sibling trap.
