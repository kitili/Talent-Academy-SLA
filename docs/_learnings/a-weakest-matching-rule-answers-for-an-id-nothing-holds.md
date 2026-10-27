# A weakest matching rule answers for an id nothing holds

**Scope:** transferable
**Area:** the Map's one search ranking (`rankMapSearchMatches`, `src/utils/process-graph/mapSearchMatch.ts`) and everything that resolves a term through it: the search bar, `?focus=`, `open_panel`, MCP `search_entities`.
**Status:** fixed 2026-10-14 (SI test run I-20; `plans/splotch-agent/agent-tool-contracts-plan.md`, D4).

## The symptom

MCP `search_entities("customscript_4a_approval_wfa")` on the JW project answered the record `custom`, `match: "partial"`, for a script the inventory called "resolves an exact script id to an unrelated record". The agent had no reason to doubt a hit that carried a canonicalId.

## Why it was misleading

The ranking already put an exact `own_script_id` first (`MAP_SEARCH_RANK.ownId`), and `a-shared-index-is-not-a-shared-search.md` says an exact id beats every partial. Three other PROD versions that held the script ranked it first, so "exact id ranking is broken" was the obvious theory and was wrong.

## Why it happens

JW's newest version (`b4eaef5f`, selected 2026-10-13) has no row with that `own_script_id`; five rows only mention it in `object_references`. With no handle held, the list falls through to its last rule, `termContainsLabel` ("the term contains a whole label", written for "Customer Record Type" naming the record "Customer"). Script ids embed record names, so the id contains the label `custom` and the rule answers. Reproduced through `loadSystemMapSource` and `rankSystemMapMatches`: `customscript_nonexistent_zz` got the same record.

## What to do

- When a ranked lookup returns something for an id that does not exist, look at the *last* rule, not the first. A fallback that is right for phrases is wrong for identifiers.
- Give identifier-shaped terms (no whitespace, an underscore or a digit) only the exact and containing-handle rules, so a miss is `matched: false`. `tests/unit/process-graph/mapSearchMatch.test.ts` ("an id Splotch does not hold is a miss") and `tests/unit/mcp/systemMapQuery.test.ts` pin it; both fail if the guard is removed.
- A test for an id lookup needs the absent id and a record whose name the id contains, not only the present id with a colliding neighbour.
