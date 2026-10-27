# An empty string is not an absent value (but `??` thinks it is one)

**Scope:** transferable
**Area:** Repo Refresh file-metadata comparison; NetSuite settings fingerprint
extraction profiles
**Status:** both fixed — identity fields normalize blank to null through
`normalizeMetadataIdentity`, the SDF writer uses `|| null`, and
`OPTION_SENSITIVE_SECTIONS` now covers every pass that decorates a fingerprinted
section

**Note on the code shown below:** this investigation ran against the SuiteQL
change probe (`netsuiteChangeProbe.ts`, `probeReach.ts`), which has since been
decommissioned — NetSuite refreshes now diff two acquisitions instead. The
snippets are kept as the evidence they were. The trap itself is not retired: the
`?? null` / `|| null` asymmetry lives in any pair of writers to the same field,
and `normalizeMetadataIdentity` is what guards it today.

## The symptom

A "Check for changes" on a live NetSuite repository reported:

```
Scripts & files            24 of 40 files changed
Custom fields              1 of 14 custom fields changed
Custom records             5 of 74 custom records changed
Settings & configuration   11 changed
```

**24 of those 30 "changes" were false.** The files had not been touched.

## Why it was misleading

Everything about the result looked healthy. The panel reported no caveat at all
— `incomparable` was zero for every area, so there was no "(N not yet
comparable)" note to raise an eyebrow. The persisted `probeReach` record agreed
with the panel exactly. A live re-run of the probe reproduced the same 30. Three
independent surfaces said the same thing, and they were all reading the same
wrong comparison.

The tell was in the raw metadata, not the counts:

```
baseline: modified_at=-  hash=-  id=          ← id is "", not null
live    : modified_at=2026-09-07  hash=-  id=11865
```

and in the dates. The live modification dates were **2026-09-07, 09-08 and
09-09**. The baseline snapshot was taken **2026-09-18**. *A file last modified
on the 7th cannot have changed since a snapshot taken on the 18th.*

### The mechanism

`compareFileMetadataEntries` guards each field family on null:

```ts
if ((a.source_id ?? null) !== null && (b.source_id ?? null) !== null) {
    return a.source_id === b.source_id ? 'equal' : 'different'
}
return 'incomparable'      // ← the branch that should have run
```

`'' ?? null` is `''`, and `'' !== null`, so **the guard passes on a blank**. It
then compared `'' === '11865'`, got false, and returned `different` → modified.
The `incomparable` branch one line below was unreachable for these rows.

The blank came from an asymmetry between two writers of the same field:

```ts
// acquisition — netsuiteFileMetadata.ts
source_id: file.internalId ?? null      // keeps ''
// probe — netsuiteChangeProbe.ts
source_id: file.internalId || null      // correct
```

`mergeRepoFileMetadata` had the same hole in a third place: `next.source_id ??
current.source_id` means a **blank patch overwrites a good stored value**, so
the blank was self-perpetuating — the check's own self-heal backfill could not
clear it.

Exactly 24 rows in that version carried `source_id: ''`, matching the 24
reported file changes one-for-one.

### The blank also blocked its own repair

The check self-heals: `backfillScriptsWithProbe(..., { seedProbeIdentity: true })`
seeds probe-comparable identity onto baseline rows that have none, so the next
check compares for real. It decides which rows to seed with the same operator:

```ts
const missingProbeIdentity =
    options.seedProbeIdentity === true &&
    (existing?.source_id ?? null) === null &&      // false for ''
    ...
```

A row whose `source_id` was `''` therefore looked *already seeded* and was
skipped — so **the rows that most needed the repair were exactly the ones the
gate refused to repair**. That is why 24 rows sat blank for days across several
checks instead of healing after the first one.

It is also the trap inside the trap: fixing only the comparison would have
turned a false positive into a *permanent* blind spot, since those rows would
report "not yet comparable" forever with nothing able to clear them. Both the
comparison and the gate had to move together, which is only obvious once you ask
"what repairs this, and does the repair have the same bug?"

### The same shape, one layer over

The settings half of the same panel had an unrelated instance of "the guard only
covers part of what it looks like it covers". `sectionsAreComparable` refuses to
compare a section across an extraction-profile mismatch — but the mapping was:

```ts
const OPTION_SENSITIVE_SECTIONS = { users: 'roleAnalysis', controlEnvironment: 'roleAnalysis' }
```

two sections, one flag. The RESTlet's own extractor table says otherwise:

```js
['users',         () => extractUsers(opts.includeRoleAnalysis)]
['customRecords', () => extractCustomRecords(opts.includeRecordCounts)]
['workflows',     () => extractWorkflows(opts.includeWorkflowCounts)]
```

`includeWorkflowCounts` was the clearer hole: it decorates a fingerprinted
section and was not in `SettingsExtractionProfile` at all, so it could never be
compared — an option that cannot differ *on the record* can still differ *in
fact*.

But the profile mismatch turned out to be the **smaller** half of the settings
story, and believing otherwise cost a wrong fix. Measuring two real extractions
of the same account three days apart showed nine differing sections, of which
four differed for no configuration reason whatsoever:

```
accountingPreferences   6 differing leaves — all `observedAt`
chartOfAccounts        27 differing leaves — all `observedAt`
items                  17 differing leaves — all `observedAt`
customRecords           2 differing leaves — both `recordCount`
```

`observedAt` — a per-probe "when did this run" stamp — was simply missing from
the volatile-key list, so every section carrying structural evidence rehashed on
every extraction forever. It had nothing to do with profiles.

And the fix interacted: once `recordCount` was excluded from the hash as data
volume, the `customRecords` profile guard that had been added to suppress the
symptom became actively harmful — it would have marked a now-comparable section
`unknown` on every deep check. **The guard had to be removed as part of fixing
the cause.** A mitigation added at the wrong layer does not become harmless when
the right layer is fixed; it becomes a new bug.

## The check

0. **Ask what repairs the bad state, and check whether the repair shares the
   bug.** A self-heal gated on the same faulty predicate turns a visible wrong
   answer into an invisible permanent one.
1. **Grep for `?? null` on any field that can be blank.** `??` distinguishes
   `null`/`undefined` from everything else; it does not distinguish *absent*
   from *empty*. If the field means "identity, or nothing", `||` or an explicit
   normalizer is the right operator, and the two must agree across every writer.
2. **When a change count looks implausible, read the raw metadata and the
   dates — not the counts.** A modification date that predates the baseline is
   proof of a false positive that no amount of recounting will show you.
3. **Diff the real payloads for the leaf paths that differ, before theorising
   about why.** Two stored extractions were enough to answer in one run what two
   rounds of plausible reasoning got wrong — first "it's record counts" (it was
   mostly timestamps), then "the profile records intent not outcome" (it does
   not; the sections were absent from every extraction). A leaf diff is cheap
   and it does not have opinions.
4. **When a guard maps sections to options, diff that map against the thing that
   actually produces the sections.** Here the RESTlet's extractor table is the
   authority; the TypeScript map was a partial transcription of it and nothing
   held the two together.

### A swallowed error reads as a working query

Widening the probe's coverage meant asking NetSuite which tables SuiteQL can
reach. The first answer was that **all 22 candidates were queryable** — an
implausible result that was only caught by adding a control:

```
ThisTableDoesNotExist12345   OK  (table exists, zero rows)
Zzz_Nonsense_Table           OK  (table exists, zero rows)
```

`runSuiteQLPage` returns `{ success: false, error }` rather than throwing, so a
`try/catch` around it catches nothing and an unchecked `items ?? []` turns every
provider error into "zero rows". Reading `success` gave the real answer: three
tables work, eleven answer `Invalid search type`.

The same shape bit twice more in one sitting. `SELECT * FROM CustomSegment`
succeeded and returned no rows — which proves the table exists and proves
**nothing** about the columns you mean to select; the explicit query then failed
on `Unknown identifier 'lastmodifieddate'`. An empty result is not a passing
test, and a query that succeeds is not a query that returns what you asked for.

See [a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md)
— this is the same trap in a different client, which is the point of that entry.

## The general lesson

**A sentinel check tests for the sentinel, not for the meaning.** `?? null` asks
"is this null-ish", and the code around it was written as if it asked "do we
have a usable value". Wherever those two questions diverge — blank strings,
empty arrays, zero, `NaN` — the guard silently inverts: the case it exists to
catch is the exact case it lets through.

The second-order lesson is about agreement: three surfaces reported the same 30
changes and all three were wrong, because they were three readings of one
comparison. Agreement across surfaces is not corroboration when the surfaces
share a source — see
[agreement-across-drivetrain-surfaces-is-not-verification.md](agreement-across-drivetrain-surfaces-is-not-verification.md).

Related: [a-bounded-read-is-not-an-ordered-one.md](a-bounded-read-is-not-an-ordered-one.md),
[one-rule-many-layers.md](one-rule-many-layers.md),
[two-names-for-one-probe-is-not-two-sources.md](two-names-for-one-probe-is-not-two-sources.md),
[a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md)
