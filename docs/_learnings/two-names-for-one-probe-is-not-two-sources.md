# Two names for one probe is not two sources

**Scope:** transferable

A verification that prints the same value twice under different names looks
corroborated and is not. Count the API calls, not the fields.

## The symptom

A NetSuite configuration change completed and its receipt read:

```json
"items": [{ "outcome": "verified_applied",
            "settingKey": "feature.advancedNumberingSequences",
            "observedValue": true }],
"fullyVerified": true,
"unexpectedlyChangedFeatures": ["advancedNumbering"]
```

Two lines about the same feature, apparently independent: one confirming the
change, one warning that a *different* feature had moved on its own.

Both came from a single `runtime.isFeatureInEffect` call.

## Why it was misleading

The account extractor stores every feature probe twice:

```js
var enabled = runtime.isFeatureInEffect({ feature: feature })
flags[key]        = enabled   // "advancedNumbering"        — camelCase, top level
allFlags[feature] = enabled   // "ADVANCEDNUMBERINGSEQUENCES" — NetSuite's id
```

Two consumers then read different halves. The verifier looked up the SDF id and
found it in `allFlags`. The omission detector walked top-level keys, saw
`advancedNumbering`, uppercased it to `ADVANCEDNUMBERING`, failed to match
`ADVANCEDNUMBERINGSEQUENCES`, and filed it as an unrequested change.

So one probe produced two receipt lines that read as independent evidence, and
the disagreement between them was pure key-space mismatch. Both failure
directions are here at once:

- **False corroboration.** `fullyVerified: true` rested on one source. Had
  `isFeatureInEffect` been wrong, nothing would have caught it.
- **A warning that always fires.** Every successful single-feature change named
  its own feature as collateral damage. A warning with a 100% false-positive rate
  trains the reader to skip the line that would have said half the account was
  wiped.

## The check

Ask how many times the code crossed the network, then how many distinct APIs it
asked. If the answer is one, no arrangement of the result is corroboration.

For NetSuite feature state specifically there is a genuine second source, and it
is the better one: `config.load({ type: config.Type.FEATURES })` returns the
Enable Features page's own backing record.

```
runtime.isFeatureInEffect('ADVANCEDNUMBERINGSEQUENCES')  -> true
config.Type.FEATURES .advancednumberingsequences         -> true
```

Field ids on that record are the lowercased runtime ids
(`BALANCING_SEGMENTS` → `balancing_segments`).

Two rules make a second source pay off rather than just add noise:

- **Disagreement must resolve to no value**, not to a preferred source. A
  conflict that still yields a boolean is a single-source verdict wearing a
  second source as decoration.
- **Absence must not read as `false`.** "This account does not expose the field"
  and "the feature is off" are different facts; merging them converts a mapping
  gap into a confident wrong answer.

## The general lesson

When a payload carries the same fact under several spellings, downstream code
will eventually treat two spellings as two witnesses. Either store it once, or
make the source explicit in the shape — a reading that names which API produced
it cannot be double-counted by accident.

Relatedly, a warning's usefulness is set by its false-positive rate, not by its
wording. A detector that fires on every success has already been switched off in
the reader's head.

## Status

Designed out for the configuration-write path on 2026-09-18.
`src/utils/netsuite/configChanges/featureStateSources.ts` models readings as
`{source, value, fieldId}` and refuses to call one reading corroborated;
`conflicted` resolves to `null`, so it is structurally incapable of producing
`verified_applied`. The omission detector matches both key spaces via
`FEATURE_KEY_CANONICAL`.

The underlying extractor still stores each feature twice — that shape is shared
with account ingestion and was not changed.

Related: [agreement-across-drivetrain-surfaces-is-not-verification.md](agreement-across-drivetrain-surfaces-is-not-verification.md),
[green-validation-that-never-parsed-the-file.md](green-validation-that-never-parsed-the-file.md)
