# A rect measured in an opening dialog is scaled

**Scope:** transferable

## The symptom

On 2026-09-25 `tests/browser-fixtures/process-selection-virtualization.spec.ts` failed on its first check,
before any click: every collapsed category row in the process selection list overlapped the next by 3.3px.
A collapsed row is a 58px card plus `pb-2`, 66px in all; the virtualizer had placed the rows 62.7px apart,
which is 66 × 0.95.

The list's `measureElement` was `(element) => element.getBoundingClientRect().height`. The dialog it sits in
(`src/components/ui/dialog.tsx`) opens with `data-[state=open]:zoom-in-95` over 200ms, and a rect includes
CSS transforms, so rows mounted during the zoom were measured at up to 95% of their height. The
ResizeObserver watches the border box, which a transform does not change: no callback came when the zoom
ended, and the sizes stayed short.

## Why it was misleading

`getBoundingClientRect()` is the fractional, exact-looking API, which is why it replaced the library default
(in May, when the rows moved from `gap: 8` to `pb-2` padding). It answers where an element is on screen, not
how tall its layout is, and the two agree until a transform is running.

The damage is small and partial. On collapsed rows the 8px gap shrinks to 4.7px, so nothing visibly
overlaps; only rows mounted during the 200ms zoom are affected, because a row expanded later is re-keyed
and a row scrolled in later mounts after the zoom, so both are measured at full size. Whether the bug shows depends on when the list mounts relative to the
animation, so a change elsewhere in the modal that alters mount timing can turn the test red (or green)
without touching the list. It was found while verifying an unrelated removal in the same modal; no earlier
run of the spec was on record to say when it began failing.

## The check

- For sizes that feed layout (a virtualizer's `measureElement`, masonry, sticky offsets), read the layout
  box: `ResizeObserverEntry.borderBoxSize` (fractional) or `offsetHeight`. Keep `getBoundingClientRect()` for
  positions on screen.
- An error that is the same fraction of every row (here 5%) is a transform, not padding or an estimate:
  divide the gap by the row height before hunting through CSS.
- TanStack Virtual's default `measureElement` already reads `borderBoxSize`, then `offsetHeight`. An
  override needs a reason and must keep that property.
- Anything measured inside a primitive from `src/components/ui` that opens with `zoom-in-95` (dialog,
  alert-dialog, popover, dropdown-menu, context-menu, select, tooltip) is measured while
  scaled.

## Evidence

- Fix (2026-09-25): `measureElement: (element, entry) => entry?.borderBoxSize?.[0]?.blockSize ??
  element.offsetHeight` in `src/components/canvas/ProcessSelectionModal.tsx`; the spec passes. Pinned by
  `tests/unit/code-ingestion/progressiveIngestionWidget.test.ts`, which also forbids the rect measure.
- The rect measure arrived in `93b0ea448` (2026-05-28).
- Library default: `measureElement` in `node_modules/@tanstack/virtual-core/dist/esm/index.js` (3.16.0).
