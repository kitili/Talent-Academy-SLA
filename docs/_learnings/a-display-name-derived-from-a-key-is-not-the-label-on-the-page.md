# A display name derived from a key is not the label on the page

**Scope:** transferable

A lookup that accepts "every name a caller could have" is only as good as the
list of names it was given. If the list was derived from your own keys, the one
name it lacks is the one printed on the screen the user is looking at.

## The symptom

```text
User:  Could you disable A/P?
Agent: No NetSuite feature under Enable Features matches "A/P" -- the lookup
       found nothing by that name, so there's nothing I can target.
```

`PAYABLES` was in the catalogue, writable in both directions, resolvable by
`PAYABLES`, `accountsPayable`, `feature.accountsPayable` and "Accounts Payable".
The Enable Features page labels the checkbox "A/P".

## Why it was misleading

The catalogue already had an alias system, added after an earlier miss of the
same shape ("Knowledge Base" against a twelve-entry allowlist). Every entry
carried four spellings and a test asserted it. The fix for the previous miss
made this one harder to see: the lookup *looked* generous.

But every spelling was derived from one source, the extractor's camelCase key.
`accountsPayable` became "Accounts Payable"; `pickPackShip` became "Pick Pack
Ship"; `customCode` became "Custom Code". None of those is what NetSuite prints.
Running every label on the live page through the lookup found 38 of 182 missed,
and every one of the 38 was a writable feature.

The second half: 22 checkboxes on the page are not in Oracle's SDF list at all.
Those got the same "no match" answer as a typo. "Splotch cannot set SuiteTax,
change it on the Tax tab" and "Splotch has never heard of SuiteTax" are
different answers, and only the first is true.

## The check

Take the names from the surface the user reads, not from your keys, and run all
of them through the lookup. For the Enable Features page:

```js
[...document.querySelectorAll('input[type=checkbox][id$="_fs_inp"]')]
    .map(el => document.getElementById(el.id.replace('_fs_inp', '_fs_lbl')).innerText)
```

Every label must resolve to exactly one entry, or to an entry that says "known,
not settable this way, here is where". Zero "not recognised" for a name that is
on the page. `catalogue.test.ts` now asserts this against a committed capture.

Then test the matcher's *restraint* as hard as its reach: "Knowledge Bas" must
not match "Knowledge Base", and "Time Tracking" must not match "Time Tracking
for CRM". A matcher loose enough to bridge "A/P" and "Accounts Payable" on its
own would be a guesser, and a guess here selects a production change.

## Status

Designed out 2026-09-18. The page is captured into
`enableFeaturesPage.captured.json` and feeds the generator; each catalogue entry
carries `netSuiteLabel`; page-only features are kept with `sdfConfigurable:
false`; matching normalises punctuation, case and filler words but stays exact
(`settingNames.ts`); an ambiguous name is reported as ambiguous, never picked.

Related: [two-names-for-one-probe-is-not-two-sources.md](two-names-for-one-probe-is-not-two-sources.md),
[head-truncated-cli-output-discards-the-line-that-explains-the-failure.md](head-truncated-cli-output-discards-the-line-that-explains-the-failure.md)
