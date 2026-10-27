# An unrecognised refusal typed as a network error is retried by every loop

**Scope:** transferable
**Area:** error classifiers that fall back to a retryable type, and the retry loops that trust them
(`inferExtractionErrorType` and the File Cabinet reconciliation loop in `src/utils/netsuite/sdfExtractor.ts`).
**Status:** fixed for the SDF File Cabinet refusal on 2026-10-21 (hotfix branched from `origin/qa`). Still open:
the classifier's `network` fallback and its whole-output `permission` substring rule are unchanged for other text.

## The symptom
An SDF extraction ran 5.8 h on FMC's sandbox (PROD, SDF job `4bb7dd06`, 2026-10-20/21): `managedRequested` 9,225,
`managedAcquired` 0, 12,108 errors (9,274 `network`, 2,834 `permission`), `recoverable_incomplete`. Every managed
error read:

> The file cabinet path(s) "/SuiteBundles/Bundle 112469/com.netsuite.ed/lib/StackBlur.js" are invalid. The file
> cabinet path must start with either of the following: "/SuiteScripts,/Templates/E-mail Templates,/Templates/Marketing
> Templates,/Web Site Hosting Files".

The demo account went from about 0.5 h per extraction to 2.5 h and then 4.3 h from 2026-10-07, with about 3,640
requested and 0 acquired.

## Why it was misleading
The errors were typed `network` and stored `resumable: true`, so they read as a flaky connection worth another run,
and the receipt already excluded managed bodies from blocking, so nothing looked wrong except the duration. The
progress counter sat at "9363/9363" for hours while the retry loop ran one `file:import` per path. And the docs said
the bodies were downloadable.

## Why it happens
The classifier knew `auth` and `permission` and returned `network` for anything else. A deterministic refusal it had
never seen became a retryable fault. The reconciliation loop retried every missing path once, and under `complete`
coverage its command budget was an alert threshold, not a limit, so the loop ran as long as the residue. Meanwhile the
`permission` rule matched on a substring of the whole output: 21 of the "permission" errors were these same refusals,
for paths like `…/fteShared/type/permission.js`.

The refusal itself came from requesting paths outside the four roots `file:import` accepts. That included 38
`/Templates/Letter Templates/…` bodies, which became the receipt's 38 "missing eligible files".

## What to do
- An error classifier's fallback must not be the retryable type. Give a known deterministic refusal its own
  non-retryable type (here `invalid_path`, never resumable), and treat an unrecognised one as unknown, not as
  transient.
- Match a classifier rule against the tool's message, not against text that can contain user data (paths, names).
- Give a retry loop hard bounds of its own, by count and by elapsed time, that hold in every mode. Here that's
  `NETSUITE_SDF_FILE_RECONCILIATION_MAX_RETRIES` and `NETSUITE_SDF_FILE_RECONCILIATION_MAX_DURATION_MS`.
- Before requesting something, check the tool will accept it at all. The CLI's own refusal named its four roots;
  they're now `SDF_CLI_IMPORTABLE_FILE_CABINET_ROOTS`, and a test fake refuses exactly as the CLI does, so a fake that
  accepts everything can't pin the wrong assumption again.
- When a run takes far longer than it used to, read the error *messages*, grouped, before the error *types*.
