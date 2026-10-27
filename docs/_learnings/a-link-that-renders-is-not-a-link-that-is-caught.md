# A link that renders is not a link that is caught

**Scope:** transferable
**Area:** agent markdown (`src/components/builder/Markdown.tsx`) and every surface that renders it —
`Transcript`, the `AgentPanel` document body, and any future one.
**Status:** fixed for the panel; the trap stays open for the next surface that renders agent markdown.

## The symptom

A `.md` report the agent wrote, open in the artifact panel, showed its `splotch:map?focus=…` links with
the map mark and the link colour — inside table cells and in prose. Clicking any of them did nothing:
no error, no navigation, the Map tab never opened. The same links in the chat answer beside it worked.

## Why it was misleading

Both render through the same `Markdown` component with the same `components` object, so the obvious
suspects — sanitising, the remark plugin, the scheme — all check out: the anchor is there, with
`data-map-link` set to the right term. The DOM looks correct in both places.

The difference is *above* the markdown. `COMPONENTS` is frozen at module scope, so the anchor cannot
carry an `onClick`; it is deliberately inert (`role="button"`, no `href`) and relies on its **host**
catching the click with a delegated listener. `Transcript` had that listener. `AgentPanel` did not,
and the hosts only passed `openMap` to the transcript. Nothing about the rendered link tells you
whether anything is listening.

## The check

When a new surface renders agent markdown, grep for the host's handler, not the link:

```sh
grep -rn "clickedMapLinkFocus" src
```

Every surface that renders `Markdown` with agent text should appear there, and its screen should pass
`onOpenMap={openMap}` to it. `agent-map-link-contract.test.ts` pins both hosts
(`onOpenMap={openMap}` twice per screen); `tests/browser-fixtures/agent-panel-map-link.spec.ts` clicks
a link in a real panel document.

## Evidence

- Rendering: `src/components/builder/Markdown.tsx` (`a:` component, `MAP_LINK_ATTRIBUTE`).
- Hosts: `Transcript.tsx` (`handleTranscriptClick`), `AgentPanel.tsx` (`handleBodyClick`), both via
  `clickedMapLinkFocus` in `src/utils/agent-panel/panel.ts`.
- Wiring: `WorkstreamClient.tsx`, `ProjectOnboardingClient.tsx` — `openMap` to both.
