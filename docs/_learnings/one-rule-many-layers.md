# A rule you found is rarely the only place that rule lives

**Scope:** transferable
**Area:** NetSuite semantic publication, DotSON v2, diagram rendering, MCP data-plane client
**Status:** live trap — the duplication still exists

## The trap

You find the code that enforces a rule. You fix it. You verify the fix, in
isolation and against real data. You ship it. **A second implementation of the
same rule, in another layer, is still enforcing the old behaviour** — and you do
not discover it until the next runtime failure, because nothing in the layer you
changed refers to the other one.

This is not a subtle race or a framework quirk. It is simply that the same
decision is written down more than once, in more than one language, over more
than one source of truth.

## Why it recurs here specifically

This codebase enforces the same invariants at three independent layers:

- **TypeScript service code** (`utils/netsuite/*`) — resolvers and validators
- **PL/pgSQL** inside RPCs (`migrations/semantic-harmony/*.sql`) — the same
  invariants re-asserted at the write boundary
- **React state and rendering** — projections and gates that decide what the user
  sees

The database layer is the easiest to miss, because it is invisible from the
TypeScript call graph. `supabase.rpc('create_workflow_semantic_revision_v2', …)`
is one line; the several hundred lines of validation behind it live in a
migration file that nothing imports and no editor jumps to.

Designed out 2026-09-20: `create_workflow_semantic_revision_v2`, the
`add_semantic_revision_v2_hardening` gates, and the other
`migrations/semantic-harmony/` PL/pgSQL writers named below were removed from
the code with the DotSON V2 layer (`plans/drivetrain/dotson-v2-deprecation-plan.md`;
the folder is retired, its tables drop from staging in Phase 5). Those rows in
the table are history. The lesson stands: the drivetrain's own RPCs
(`migrations/drivetrain-prod/`) and every React projection are still second
layers for a rule fixed in TypeScript.

## Instances observed in one session

| Rule | Layer fixed | Second layer that still enforced it | Found by |
| --- | --- | --- | --- |
| Which element properties carry meaning | patch applier | comparison diff, sync fingerprint, version diff, canvas batch restyle, canvas rebuild gate — **six more** | live testing, one at a time |
| Canvas rebuild on activation change | rebuild-gate projection | `createModelFromGraph` handing back an aliased element, so both sides read alike | live testing after shipping a "complete" fix |
| Workflow owner resolution | `selectWorkflowOwner` (TS) | `create_workflow_semantic_revision_v2` reads `processes.own_script_id` directly | runtime 500 after the TS fix shipped green |
| Source closure completeness | `sourceClosureManifest` (TS) | `add_semantic_revision_v2_hardening.up.sql:373` rejects `dependencyClosure.complete = false` | runtime 500 after the TS fix shipped green |
| Critical Current is an explicit snapshot pointer | creation RPC and individual Splotch routes | the canvas SVTD batch projection still selected only legacy working versions, so a successful streamed Splotch disappeared on refetch | live browser reproduction plus read-only pointer/content inspection |
| What a diagram element means (UML) | the comparison's semantic fields (label, shape, lifecycle) | a UML class carries its meaning in `uml.attributes`, which neither `canonicalizeDotsonElementForDiff` nor `computeDiagramDiff` read, so a field added to a class on a Draft compared as no change and built nothing (fixed 2026-10-06 with `umlClassMembersSummary`) | building the data-model Current, by diffing a Draft with one added attribute |
| Only platform modules may be omitted | closure-omission validation (PL/pgSQL, ~line 780) | the delegation-fact validation **in the same function**, ~line 842, re-asserts `limitationCode = 'platform_module'` for any `moduleSourceStatus = 'omitted'` | reading the function while implementing the extractor fix -- before it could fail |

The last two are the sharpest: both were fixed in TypeScript, both had a full
test suite passing, both were verified against real staging data, and both failed
at runtime because PL/pgSQL held its own copy.

## It is not only a SQL problem: a guard written out per call site

The same trap, in one file, in one language, with no database involved.

`workers/splotch-mcp/src/splotch_mcp/splotch_client.py` validates every id it
interpolates into a request path, because httpx normalises the path it builds —
so a percent-encoded `../..` is decoded back into real traversal before the
request leaves, and escaping is not a defence. The check was written out **at
each call site**: `canvas_tool` had a copy, `create_workstream` had a copy.

When `rename_project` and `delete_project` were added later, they got neither —
on `PATCH` and `DELETE`, the two verbs where a traversal matters most. The suite
stayed green, because the traversal test named `canvas_tool` explicitly and a
per-method test cannot fail for a method nobody added it to.

Two things this instance teaches that the SQL ones do not:

- **A rule duplicated by copy-paste inside one file is still a rule in many
  layers.** The layers do not have to be different languages, or different
  processes, for the second copy to be the one that goes missing.
- **The test shape matters more than the test count.** The fix collapsed the
  four copies into one `_require_canvas_id()`, and replaced the per-method
  traversal test with one that *discovers* every public coroutine whose
  signature takes a `canvas_id` and feeds a traversal to each. That test fails
  for a method added without the guard, which is the only version of it that
  would have caught this. Written in
  `workers/splotch-mcp/tests/test_splotch_client.py`.

The discovery test was itself verified by removing a guard and confirming it
failed — see `a-refusal-test-that-passes-when-the-refusal-is-gone.md`, which is
the failure mode a refusal test invites.

One more tell worth recognising: **two existing tests had to be changed to make
the fix pass.** They called the new methods with `canvas_id: "abc"` and had been
passing only because nothing validated it. A test that has to be relaxed is
suspicious; a test that has to be made *more* realistic is usually evidence the
code was wrong, not the test.

## The check

Before declaring a rule fixed, grep for it **outside** the language you changed.

```bash
# The error text, wherever it lives
grep -rn "<the exact message>" migrations/ src/ supabase/

# The concept, in SQL
grep -rn "<column_or_field>" migrations/

# Every RPC the feature calls — each one is validation you have not read
grep -rn "\.rpc('" --include=*.ts src/<feature-area>/
```

If the feature calls an RPC, **open the migration that defines it** and read the
validation before assuming the TypeScript path is the whole story. An RPC name in
a `.rpc()` call is a pointer to code, not a primitive.

## What "verified" does not cover

All four instances above passed:

- the full test suite
- a typecheck
- targeted unit tests written specifically for the fix
- in two cases, direct verification against production-shaped data

None of that reaches a PL/pgSQL function body or a second React layer. **A green
suite is evidence about the layer the tests import**, and nothing more. Where a
rule spans layers, the only honest verification is exercising the whole path.

## Corollary: when removing a check, enumerate its siblings first

Removing one gate and re-testing found the next gate, and so on. Three rounds on
the same concern, each a deploy cycle:

1. `source closure is incomplete` (TypeScript) -- removed
2. `Semantic manifest v2 source closure is incomplete` (PL/pgSQL) -- removed
3. `dependency closure contains a disallowed omission` (PL/pgSQL) -- removed

All three lived in the same feature and two in the same function, and a single
grep would have listed all nine closure-related refusals at once:

```bash
grep -n "RAISE EXCEPTION" migrations/<file>.sql | grep -iE "closure|omission"
```

Run that BEFORE removing the first one. Then decide about the whole set
deliberately -- which are policy, which are structural integrity -- instead of
discovering them one runtime failure at a time. Removing checks one at a time
until something passes is also how you end up with no checks and no memory of
what they were for.

The same grep is worth running before *adding* a check: the one you are about to
write may already exist a layer away.

## The stronger corollary: fix the producer, not the checks

Three layers independently refused the same build: TypeScript closure
completeness, the PL/pgSQL closure-omission policy, and -- unnoticed until the
function was read line by line -- the PL/pgSQL delegation-fact policy. Two were
removed one deploy cycle at a time. The third would have been the next failure.

None of them was the defect. The defect was upstream, in what the extractor
*produced*: a module too large to inline was being dropped from the closure
instead of recorded in it, so a legitimate condition was being reported as a
missing dependency. Fixing that one producer satisfied all three layers at once,
including the one nobody had found yet, and it made `closureDigest` cover a file
it had been silently ignoring.

The heuristic: when several independent layers all reject the same artifact, that
is evidence about the artifact, not about the layers. Removing checks one at a
time is chasing the symptom, and the count of remaining checks is unknown by
construction -- you cannot tell how many deploy cycles are left. Ask what the
producer is asserting and whether it is true.

Watch for the inverse hazard when you do. Correcting a producer can quietly
weaken a guarantee that read off the old, wrong value: here, every narrative
hedge keyed off `moduleSourceStatus !== 'included'`, so making the status honest
about *membership* would have made the prose dishonest about *knowledge*. The
fix has to carry the guarantee across to whatever now expresses it -- see
`moduleBodyReachedThePrompt` in `workflowProviderSourceFacts.ts`, written once
and exported because it already has two consumers.

That hazard bit twice, and the second one was only found by running the Build.
A PL/pgSQL check asserted an accounting identity:

```
selectedCharacters = SUM(contentLength) OVER every non-owner document
```

exact while every document was inlined, stale the moment some were not. The
writer refused with "dependency closure shape is invalid" -- correctly, against
a rule that had quietly stopped describing reality. Grepping for the CONCEPT
(`closure`, `omission`) found the policy gates but not this one, because it is
arithmetic and mentions neither word.

So extend the search when you change what a producer emits: grep for the FIELDS
you changed the meaning of, not only for the rule you think you are touching.

```bash
grep -rn "selectedCharacters\|contentLength\|documents" migrations/
```

And prefer restating a stale invariant over deleting it. The fix narrowed the
sum to `includedInPrompt` documents and carried that flag into the manifest
projection so SQL could see it; a document appearing without the counter moving
is still caught, which is what the check was for.

## Leaving it better

When you find a duplicated rule, prefer collapsing it to re-fixing both copies:

- If the database needs a value the application derives, **materialize** the
  derived value into the column the database reads rather than reimplementing the
  derivation in PL/pgSQL. See `workflowOwnerResolution.server.ts` and
  `backfill_workflow_owner_from_association.*.sql` — one rule in TypeScript, its
  output persisted, SQL checking something that is now true.
- If a check is genuinely redundant with another check beside it, prove the
  redundancy with evidence and remove it, rather than keeping both. See
  `docs/netsuite-ingestion/architecture.md`, "Source Closure: A Record, Not A
  Gate", where `sourceDigest` was shown to cover every object and file that
  `closureDigest` covered.
- When you remove a check in one layer, **remove or reconcile its twin in the
  same change**. A half-applied removal is worse than either state: the
  application now produces something it considers valid, which another layer
  rejects.

## Related

- `docs/netsuite-ingestion/architecture.md` — Workflow Owner Resolution, Source
  Closure
- `docs/before-and-after/architecture.md` — the seven field-allowlist instances
- `tests/unit/before-and-after/activationCrossSiteAgreement.test.ts` — feeds one
  change to every consumer at once, because per-module tests cannot catch a rule
  that is missing from the module nobody thought to open
- `docs/netsuite-ingestion/future-improvements.md`, "`POST /api/netsuite/connect`
  still carries its own copy of connection creation" — the instance found
  2026-09-17 while extracting that route for MCP reuse: the shared creator
  (`createNetSuiteConnectionForUser`) already existed with two callers, the
  route had its own copy, and the two had drifted in four named ways. The plan
  that scheduled the extraction had called it "a move"; it would have been a
  third copy. The check that catches this before planning: grep for the
  *sequence's* function names (`createConnection`, `updateConnectionMetadata`)
  across `src/`, not for the route. **Collapsed the same day**: the route now
  calls the shared creator, which refuses with a typed
  `NetSuiteConnectionCreateError` so the route can keep its own response
  shape without re-implementing the rule. The entry stays because the trap
  — a shared helper that already exists, beside a route that predates it —
  is exactly the kind a reviewer should recognise on sight.

Related: [a-wiring-test-that-reads-the-dead-path.md](a-wiring-test-that-reads-the-dead-path.md), the same
trap across two pipeline parents: a fix made in the parent no request runs.

Worked case: [clearing-one-layer-of-a-rule-is-not-clearing-the-rule.md](clearing-one-layer-of-a-rule-is-not-clearing-the-rule.md),
where one cleared blocker of the drivetrain rollback rule was read as the whole search (four places, two
in a separately deployed worker).
