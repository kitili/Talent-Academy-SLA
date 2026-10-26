# A SQL `ORDER BY` compared against an app-sorted array needs `COLLATE "C"`

**Scope:** transferable
**Area:** semantic revision v2 writer, DotSON v2 writers (`migrations/semantic-harmony/*`)
**Status:** fixed for the semantic-revision writer; the same shape exists elsewhere

## The symptom

```
Failed to create semantic revision v2:
Semantic manifest v2 content core does not match its components.
```

Every Build refused. The two things being compared are built from the *same*
data by the *same* process moments apart, so "they do not match" reads like a
serialization bug or a race. It is neither.

## What is actually compared

The writer re-derives the content core from the persisted components and demands
jsonb equality:

```sql
SELECT jsonb_agg(
           component->'semanticContent'
           ORDER BY component#>>'{semanticContent,semanticIdentity}'
       )
  INTO v_projected_semantic_components ...
IF v_semantic_content->'components' IS DISTINCT FROM v_projected_semantic_components THEN
```

**jsonb array equality is order-sensitive.** So this holds only if PostgreSQL
sorts the identities exactly as the application did. The application sorts by
code point:

```ts
function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0
}
```

The `ORDER BY` has no `COLLATE`, so it uses the database's default collation. On
a linguistic collation — `en_US.UTF-8` and friends, the Supabase default —
punctuation is not a deciding character at the primary level. These identities
are made of punctuation:

| pair | byte order | linguistic order |
| --- | --- | --- |
| `workflow-action:workflowaction774`<br>`workflow-action:workflowaction_4a3wm_heal` | `'7'` (0x37) < `'_'` (0x5F) → `774` first | `_` dropped → `4` < `7` → `_4a3wm_heal` first |
| `workflow-transition:workflowtransition278`<br>`workflow:customworkflow_4a_approval_wf_vb` | `'-'` (0x2D) < `':'` (0x3A) → transition first | both dropped → `c` < `t` → `workflow:` first |

Two inversions in an 89-component manifest are enough. The arrays differ, the
writer refuses, and nothing in the message points at collation.

## Why it was misleading

- Both sides are produced by the same code path from the same objects, so the
  natural hypotheses are all wrong ones: key ordering in JSON, a digest computed
  over a different snapshot, a concurrent write.
- The identities are lowercase ASCII. Collation feels like a problem for names
  and accents, not for `workflow-action:workflowaction774`. The deciding
  characters here are `-`, `:` and `_`, which is exactly what a linguistic
  collation is designed to look past.
- **The codebase already knew.** The same file spells out
  `COLLATE pg_catalog."C"` for canonical-JSON key ordering. One `ORDER BY` was
  written without it, and that was the whole defect.

## The check

Any `ORDER BY` on text whose result is compared against something the
application sorted must pin its collation:

```sql
ORDER BY component#>>'{semanticContent,semanticIdentity}' COLLATE pg_catalog."C"
```

Enumerate them before assuming yours is the only one:

```bash
grep -rn "ORDER BY" migrations/ | grep -v COLLATE | grep -v ordinality
```

Judge each by what it is compared to, not by whether it looks risky:

- `ORDER BY entry.ordinality`, `ORDER BY attribute.attnum` — numeric, exempt.
- `array_agg(key ORDER BY key)` compared against a hardcoded `ARRAY[...]` —
  **same shape as this bug.** Several `dotson_v2_*` writers do this. Their keys
  are punctuation-free camelCase, where C and linguistic order happen to agree,
  so they have not bitten. They will the day a key with an underscore, a digit
  boundary, or a case-crossing pair is added. Check these first if one of those
  writers ever reports a shape mismatch it should not.

Designed out 2026-09-20: the semantic-revision v2 writer and the `dotson_v2_*`
writers above were removed with the DotSON V2 layer
(`plans/drivetrain/dotson-v2-deprecation-plan.md`), so no applied writer
carries this shape today. The check stands for any `ORDER BY` on text that is
compared against an app-sorted array.

## Do not "fix" it by sorting differently in the app

Matching a linguistic collation from TypeScript would mean reproducing ICU
tailoring in JS, and the answer would change when the database is restored,
upgraded, or re-created with a different locale. Pin the SQL side: `COLLATE "C"`
is byte order, which is what every language's default string comparison already
gives you, and it cannot drift with the environment.

## Related

- [plpgsql-repair-anchors.md](plpgsql-repair-anchors.md) — how to patch the live
  function safely once you know what to change
- [one-rule-many-layers.md](one-rule-many-layers.md) — why the same invariant is
  written down in both TypeScript and PL/pgSQL in the first place
- `tests/unit/netsuite/semanticComponentOrdering.test.ts` — pins the application
  order, proves the canary still exercises the divergence, and fails if any
  other text ordering in the writer loses its collation
