# A successful write that wrote nothing

**Scope:** transferable
**Area:** Repo Refresh file metadata (`mergeRepoFileMetadata`); finalize's flat SDF
parse (`saveParsedSdfData`, `src/utils/functional-clustering/sdfPostProcessor.ts`)
**Status:** fixed — every field of `RepoFileMetadataEntry` is carried through the
merge, and a structural test reads the type's fields from source and fails when
one is missing. Second instance (a wholesale replace of `parsed_sdf_data`) designed
out on 2026-10-06 (`7be2b5015`, `f483c9541`): the flat parse writes only rows it
owns and merges, and a deploy-built version rebuilds its deployed catalog rows by
merge

## The symptom

A backfill reported complete success:

```
Totals — written: 118154, already hashed: 0, no matching row: 20360, no hash produced: 0
[exited with code 0]
```

Every one of those 118,154 `UPDATE`s returned no error. The field they were
written to was in **zero** rows afterwards:

```
v1: 984 rows, 0 with canonical_sha256 (0%)
v2: 992 rows, 0 with canonical_sha256 (0%)
```

## Why it was misleading

There was no failure anywhere to find. The updates succeeded, the error channel
was empty, the exit code was 0, and the count matched the number of rows the
script intended to touch. A script that reports "written: 118154" has, by every
signal available to it, written 118,154 rows — and it had. The rows just did not
contain the field.

The cause is upstream of the write:

```ts
export function mergeRepoFileMetadata(existing, patch) {
    return {
        source_id: pick('source_id'),
        source_hash: pick('source_hash'),
        // …a fixed list…
    }
}
```

It constructs a **fresh object from a hardcoded field list**. A field on the type
but missing from that list is not "not merged" — it is *deleted*, silently, by
every write that passes through. `canonical_sha256` and `object_type` had been
added to `RepoFileMetadataEntry` and not to the list.

## Why it mattered far more than the backfill

The same merge runs at **acquisition**. So the feature those fields existed for —
canonicalised change detection, and per-type evidence gating deletions — would
have been a silent no-op in production. Every refresh would have fallen back to
the noisy raw hash, and no deletion could ever have been confirmed. Nothing would
have errored. The panel would simply have kept reporting ~29% of the repository
as modified, exactly as before the fix that was supposed to stop it.

A third field, `source_transport_omitted`, had been dropped the same way since
long before any of this work. Nobody noticed, because nothing breaks — a value
just is not there later.

## Second instance: a replace that had matched nothing for months (2026-10-06)

The flat SDF parse that finalize runs (`runSdfParsing`) wrote its output with
`update({ parsed_sdf_data: parsed })`: the whole blob, replaced. That is the same
transform as the fixed key list above, at the scale of a column. Since evidence
routing, nine other producers write keys into `parsed_sdf_data` (the catalog
entry, classification, descriptions, package, script-file and entry-point stamps,
deployment facts, the evidence bundle and narrative contracts), and the replace
deletes every one of them.

Nobody saw it, because it had stopped having input. Direct NetSuite ingestion
stopped storing SDF object XML in `scripts.script_content` in August, so on a
current version the step parsed **0 of 3,561** rows (demo v4, 2026-10-06). It
looked dead. The deploy-created repository version was the first code to write
an object's XML inline again, and it counted on this step to refresh the
deployed object's facts. Run on the demo's real rows, the replace would have left
the deployed body field with none of its 6 keys, the deployed workflow with none
of its 11, and each script with none of its 15 (or untouched, depending on which
of its XML and JS rows PostgREST returned last). The version would have
published, with no error.

Two more things kept it hidden:
- **The docs described a guard the code no longer had.** `evidence-routing.md`
  said the parser preserved `deterministic_evidence_bundle_v1`. The helper had
  been added on 2026-06-08 and removed by a revert two days later; the paragraph
  stayed.
- **The plan relied on it by name.** The deploy-version plan's step 8 says the
  projection "re-derives `parsed_sdf_data` from the new XML". It did: the XML,
  and nothing else.

The fix tests ownership by shape, not by a list. The flat parse writes only a
row that is empty or already holds a flat parse (a top-level `kind`), merges
over it, and leaves every other row alone (`mergeFlatSdfParse`). A list of
routed keys would have stopped protecting the next key someone adds.

## The check

1. **Verify the effect, never the report.** "N rows written" is a statement about
   requests issued, not about what is now in the database. Read the field back.
   This was caught by one query against production, after the script had already
   declared success.
2. **Treat any whitelist-shaped transform as a deletion risk.** A function that
   returns a literal object from a fixed key list silently discards everything
   else. `{ ...existing, ...patch }` fails safe; an enumerated return does not.
3. **Guard the list against the type, in code.** A reviewer cannot see an
   absence. Parse the type's fields and assert the transform carries each one —
   and assert the *values* survive, because key presence alone passes a mis-wired
   mapping.
4. **A replace of a blob with several producers is a deletion.** Before writing
   a JSON column whole, list who else writes keys into it (grep the key prefix
   across the code, the migrations and the workers). If anyone does, merge, or
   decide by the stored shape whether the row is yours to write at all.
5. **A writer that has matched no rows for months is still armed.** When new
   code starts producing an input an old step consumes, read what that step does
   with it now, and run it on a real row. The docs about it may describe a guard
   that a revert removed: read the code, and `git log -S` the guard.

## The general lesson

**Success is reported by the layer that acted, not by the layer that matters.**
The database faithfully stored the object it was given; the object was already
wrong. Every honest signal in the stack agreed, because none of them was looking
at the question being asked.

This is the same shape as
[a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md)
inverted: there, a failure was reported as an empty result. Here, a loss was
reported as a success. Both come from trusting a report produced upstream of the
thing you actually care about.

Related: [an-empty-string-is-not-an-absent-value.md](an-empty-string-is-not-an-absent-value.md),
[exported-bytes-are-not-a-change-signal.md](exported-bytes-are-not-a-change-signal.md),
[a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md)
