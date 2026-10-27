# A switched-off producer still has live output

**Scope:** transferable
**Area:** retiring the AI functional clustering pipeline, 2026-09-23
(`plans/netsuite-ingestion/ai-functional-clustering-deprecation-plan.md`)

## The symptom

`ENABLE_FUNCTIONAL_CLUSTERING` had been `false` since 2026-06-15, `POST /api/functional-clustering`
answered `generationSource: 'disabled'`, and the pipeline was spoken of — reasonably — as "disabled,
hence not necessary". Three months later, on 18 production repositories, the agent's change-impact
context (`processImpactContext.ts`) was still ranking processes **HIGH** on the strength of
AI-inferred workflow steps: 4,503 of them, in 195 rows the pipeline wrote before it was switched off.
The `@` picker listed the same AI clusters beside the classifier's, and a project clone in August had
copied 12 of them into a brand-new project.

A second trap sat underneath. The obvious query for "the legacy rows" is "everything that is not the
current version", `clustering_version <> 'taxonomy_v1_1'`. On staging that returned 87 rows. 71 of them
were Salesforce taxonomy rows (`salesforce-taxonomy-v2`/`-v3`, `generation_source: 'taxonomy'`) written
by an unmerged branch — deterministic, current, and about to be hidden by a reader filter or deleted by
a cleanup written against the version string.

## Why it was misleading

A flag gates a **writer**. It says nothing about what the writer already produced, and readers do not
consult the writer's flag — they read the table. "Off" was true of the pipeline and false of its
effect. Three readers happened to hide the rows (they prefer the classifier's rows in the same set);
six did not, and nothing listed which was which. The docs even stated the precedence wrongly, putting
the browser synthesizer ahead of the AI rows.

"Not the current version" feels like a definition of legacy because, on the branch you are reading,
the current classifier is the only other writer. The database is shared with branches you are not
reading: staging runs them.

## The check

Before calling a producer dead, count what it left, by what wrote it, in every environment (read-only):

```sql
select generation_source, clustering_version, count(*)
from functional_processes group by 1, 2 order by 3 desc;
```

Then list every reader of the table and ask of each one whether it can tell those rows apart:

```bash
git grep -n "from('functional_processes')" -- src
```

And look for writers you cannot see from your branch before you write a discriminator:

```bash
git log --all --oneline -S "<the table or discriminator value>"
```

Define retired data by **what produced it** (here `generation_source IN ('ai', 'fallback_bucket')` —
`src/utils/functional-classification/retiredAiClustering.ts`), never by "not the current version".
Note the column default is `'ai'`, so a new writer that omits it mints rows the rule counts as AI; set
it explicitly.

## Evidence

- Production, 2026-09-23 (GET-only census, paged by `id`): 3,046 rows — 2,819 `taxonomy_v1_1`,
  227 `functionalClustering_v1` (197 `ai`, 30 `fallback_bucket`) on 18 repositories, every one of which
  also had classifier rows for the same version. Newest AI-generated row: 2026-06-15, the day the flag
  went off; newest AI row of any kind: 2026-08-05, copied by a clone.
- Staging, same day: 443 rows — 356 `taxonomy_v1_1`, 71 Salesforce taxonomy, 16 AI.
- The readers that still serve the rows, and the decision about them, are in
  `docs/functional-classification/future-improvements.md` ("Rows the retired AI clustering left
  behind").
- Related: [one-rule-many-layers.md](one-rule-many-layers.md) — the same rule ("these rows are not
  business functions") lived in three readers and was missing from six.
