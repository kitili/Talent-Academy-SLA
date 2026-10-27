# A navigation surface that cannot finish a traversal sends the agent around it

**Scope:** transferable
**Where:** `GET /api/canvases/[canvasId]/system-map` (the agent's Map), `/api/netsuite/artifacts`,
2026-09-29. Plan: `plans/splotch-agent/map-as-agent-navigation-layer-plan.md`.

## What happened

A workstream asked whether order-to-cash was at risk from Oracle's SuiteScript 2.1 deadline, scoped to O2C.
The skills already said "use the map first". The agent read the Map summary once, then left for the
artifact index and never came back.

Nothing forbade the Map. It just could not answer:

- **Names only.** The agent's route answered a focus with plain strings, so a step from the Map to evidence
  meant searching again.
- **Cut at 60, with no way on.** An O2C function's 178 neighbours stopped at 60. Across the eight O2C
  functions, 261 neighbours were unreachable, and the Map reached 40 of the 110 legacy scripts it held.
- **No counts.** The Map screen could filter by SuiteScript version; the agent's route had no filter at all.
- **The richer surface existed.** MCP answered from `systemMapQueries` (entities, paging-ready lists,
  directed impact); the agent ran the older `systemMapAnswer` builders.

So the agent paged raw evidence instead. Each artifact page shipped 2,170 unrelated issues (12,981 lines),
the loop detector read the paging as a loop (see the companion entry), and a subagent ground through 15,000-line
pages until the run stalled. The index's record types then found 19 O2C scripts where the Map's own
attribution holds 151.

## Why it is a trap

- A rule in a skill ("use the map for discovery") is only as good as the surface it points at. When the
  surface cannot finish the job, the agent follows the rule for one call and then routes around it, and the
  transcript looks like disobedience rather than a gap.
- Every limit was individually reasonable: names keep answers small, a cap keeps them readable. Together
  they made the Map a place to look, not a place to work.
- A second, better surface for another client hides the gap: the Map "could" answer, just not for this caller.
- The fallback looked authoritative. The artifact index answered, quickly and wrongly: a seventh of the
  exposure, with no sign of what it missed.

## How to avoid it

- Give the navigation surface the three things a job needs: **handles** (ids that reach the next step),
  **paging** (a cut list says how to continue), and **counts** (a filter that answers "how many").
- One query layer for every caller. The agent's route and MCP now share `answerSystemMapTool`, so a verb the
  Map learns reaches both.
- Count where the attribution lives. `queryMap` runs the Map screen's own facts and matcher, so the agent's
  number is the toolbar's.
- Shape answers for how they are read. The harness saves anything past about 2,000 tokens to a file and
  shows five lines of it, so list rows are compact and a query's tally comes first.
