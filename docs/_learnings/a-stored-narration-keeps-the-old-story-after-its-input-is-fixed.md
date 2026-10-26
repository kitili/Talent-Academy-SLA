# A stored narration keeps the old story after its input is fixed

**Scope:** transferable
**Area:** Repo Refresh Report (`src/app/api/repo-refresh/summary/route.ts`, `src/utils/repo-refresh/summaryChangeReport.ts`, `refreshReportStore.ts`).
**Status:** designed out on 2026-10-14 for the shipped-change report (`aiSummaryBasis`)

## The symptom

Version 7 of the demo repository rolled up eight shipped changes (3 deploys, 1 cleanup, 4 record changes). Its report
called it "a 6-file Build with Splotch deploy ... plus exactly what was deployed", and the AI executive summary
described "a Build with Splotch deploy rather than a refresh". The header read one field, `summary.deployment`, which
names one deploy; the summary was given the same one-deploy context.

## Why it was misleading

Fixing the header and the context feeds the model the right input from now on, and the page looks fixed in a fresh
session. But the narration is generated once per version and stored on the report object; every viewer is served the
stored text. The version with the wrong story is exactly the one that already has it cached, so the fix is invisible
where it matters.

## Why it happens

A generated text is a function of its inputs, and the cache key is only the version id. Nothing records which inputs the
text was written from, so a later change to the inputs cannot tell the stored text is stale. A rolled-up version also
carries two summaries of its origin (`summary.deployment` for one deploy, `summary.shipped` for all of them), and any
reader that picks the older one names a single source.

## What to do

- When a cached generation's inputs change shape, stamp the generation with a basis (`aiSummaryBasis: 'shipped_v1'`) and
  serve it only when the request's basis matches; write it again once otherwise. Never invalidate by deleting rows by
  hand.
- A header or prompt for a version that can have several origins reads the list of origins, not the first one. Keep the
  one-origin wording only for the one-origin case, and test the old versions' wording unchanged.
- Test the real context builder (`buildChangeReport`) with a fixture shaped like the real case; do not call the model.
