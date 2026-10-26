# A loose screenshot tolerance on a sparse canvas cannot fail

**Scope:** transferable

## The symptom

`tests/browser-fixtures/functional-record-graph.spec.ts` compared the Map against a baseline committed on
2026-08-14: a different map, with a colour toggle, orange records and every artifact a dot. On 2026-09-25
the page had sector hulls, a legend drawer, ovals and rounded boxes, and `toHaveScreenshot` still passed.

## Why it was misleading

The assertion allowed `maxDiffPixelRatio: 0.02`. Playwright counts a pixel as different only past a
perceptual threshold (0.2), and this canvas is mostly empty background: the drawn content of a 1920×1080
frame is a few percent of it. The August map and the September page differed by **26,319 pixels, 1.27%**
(measured with the same pixelmatch rule), under the 2% allowed. The check could not have failed on any
redesign of the map.

Two things hid it. The spec's other assertions had failed first since 2026-08-30, so nobody reached the
picture. And `--update-snapshots` rewrites only snapshots that fail by default: run against a passing stale
baseline, it leaves it untouched and reports success.

## The check

- Size a screenshot tolerance to the drawn content, not the frame. Here it is 0.2% (about 4,100 pixels), six
  times under the measured drift; both runs against the new baseline on the same machine passed.
- When the page a baseline shows changes, open the baseline and look. A stale picture that passes is worse
  than none: it reads as coverage.
- Regenerate with `--update-snapshots=all`, view the new image before keeping it, and keep the old one in git
  history rather than a copy in the tree.

## Evidence

- `tmp/connections-research/pixelmatch-baselines.cjs` (old against new baseline: 26,319 pixels, 0.01269).
- The spec's tolerance and its note: `functional-record-graph.spec.ts`, 2026-09-25; the run in
  `docs/diagnostics-graph/test-suite.md`.
