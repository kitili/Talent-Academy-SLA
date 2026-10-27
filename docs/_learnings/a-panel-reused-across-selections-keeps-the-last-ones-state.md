# A panel reused across selections keeps the last one's state

**Scope:** transferable

## The symptom

On the Map, open an artifact's panel and click "view" on one of its reference files: the Code tab shows
that file. Now pick another artifact straight from the search or the canvas. Its panel opens on the
Code tab, reading "Viewing SuiteScripts/<the first artifact's file>" and "Source not loaded for this
file." The tab and the viewed file belong to the previous selection.

The same happens with any local state in the panel body. Once the panels gained Description / Overview
/ Code tabs (2026-09-24), a record picked while another record's Overview was open would have opened on
Overview too, hiding the new description it was built to show.

## Why it was misleading

Each selection looks like a new panel: new title, new content, new data from the host. But the host
renders `<MapDetailSidePanel variant="object" …>` in the same place for every artifact, so React keeps
the one instance and only swaps its props. `useState` in the body (`pane`, `viewedFile`, a tab)
survives every swap. Nothing fails, and a test that renders the panel once cannot see it, because the
bug needs two selections in a row.

This is the inverse of
[state-reset-on-a-props-identity-resets-on-every-republish.md](state-reset-on-a-props-identity-resets-on-every-republish.md):
there, state reset whenever the host republished equal data. Here it never reset when the data really
did change identity.

## The check

- For a panel, drawer or dialog that stays mounted while its subject changes, list its local state and
  decide for each piece whether it belongs to the subject or to the viewer. Subject state must reset
  when the subject changes.
- The simplest reset is a `key` on the element that names the subject
  (`key={`${lensSelection.kind}:${lensSelection.id}`}`), so a new subject mounts a fresh panel. Do not
  key on an object identity the host rebuilds on every render: that remounts on every render.
- Test it with two selections in a row, in a real browser (a server render cannot hold state).

Designed out on 2026-09-24. Both hosts, `SystemGraphMapPane` and the canvas modal
(`ProcessSelectionModal`), key the object and correlation panels by the selection.
`tests/browser-fixtures/system-graph.spec.ts` picks Sales Order, opens its Overview, then picks Credit
Tier and expects its Description.

## Evidence

- `MapDetailSidePanel.tsx` `ObjectBody`: `const [pane, setPane] = useState(…)` and
  `const [viewedFile, setViewedFile] = useState<string | null>(null)`. `viewFile` sets both, and nothing
  cleared them on a new `object`.
- `SystemGraphMapPane.tsx` before the fix: `{enabled && lensSelection?.kind === 'process' &&
  objectDetailContent && (<MapDetailSidePanel variant="object" …/>)}`, with no `key`, the same element
  for every artifact; `ProcessSelectionModal.tsx` rendered it the same way.
