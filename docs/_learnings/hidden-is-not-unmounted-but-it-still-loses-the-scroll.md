# Hidden is not unmounted, but it still loses the scroll

**Scope:** transferable
**Area:** any pane kept mounted and toggled with `hidden` / `display: none` so it survives a tab
switch. Found in the external Live Report shell (`PublicReportShell`); the trap is not specific to it.
**Status:** designed out for the Live Report on 2026-09-29 (`useRememberedScroll`,
`reportScrollMemory.ts`). Still open for any other pane that relies on staying mounted.

## The symptom

On `/reports/<token>`, scroll halfway down the report, expand a figure into its tab, click back to
Report: the report is at the top. The graph tab beside it keeps its camera perfectly across the same
switch.

## Why it was misleading

- The shell's own docblock said the panes stay mounted with `hidden` precisely so that "the report
  would \[not\] lose its scroll position". Staying mounted keeps **React** state: the graph's camera,
  the report's figures. The scroll offset is not React state. It belongs to the element's layout box,
  and a `display: none` element has none, so the browser shows it again with `scrollTop` 0.
- The graph surviving the same switch looked like proof the pattern works. It works for the graph
  because its camera is held in component state.
- The workstream panel loses the same position for a different reason: it keys its body by tab id
  and unmounts the report. Two hosts, two causes, one symptom, so a fix for either one alone looked
  like it should have covered both.

## The check

- For a pane that is hidden rather than unmounted, list what it must keep, and ask of each item
  whether it lives in component state or in layout. Scroll offsets, text selection and focus live in
  layout, and `display: none` drops them.
- Keep the offset outside the element (the Live Report keeps it in the host, see
  `docs/live-report/architecture.md#scroll-position-across-tabs`) and restore it when a
  `ResizeObserver` sees the container return from zero height.
- While the container has no height its `scrollTop` reads 0. Never save it then, or the save
  overwrites the position you are trying to keep. Animation frames run before resize observers in
  the same frame, so read `clientHeight` live rather than trusting a flag the observer sets.
- Test it in a real browser. A server render cannot hold a scroll offset, and a component test does
  not lay anything out.

## Evidence

- `tests/browser-fixtures/live-report-external.spec.ts`, *the report keeps its place*: scroll, open
  System Configuration, return, and the offset matches to within 2px.
- `tests/browser-fixtures/live-report.spec.ts` with `?panel=1`: the same across an unmount.
