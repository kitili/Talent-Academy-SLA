# An iframe's load event is not the framed app's ready

**Scope:** transferable
**Area:** any host that covers an iframe while it loads; here `src/components/canvas/SplotchViewerOverlay.tsx`
over `/splotches/<id>?embed=map` (`src/app/splotches/[id]/SplotchPageClient.tsx`).
**Status:** fixed for `SplotchViewerOverlay` on 2026-10-12. Open for `SplotchCanvasEmbed` (the agent panel's
splotch tab), which still lifts its spinner on `onLoad`.

## The symptom

Opening an existing splotch from the Business Logic Map's board showed the overlay's "Loading splotch…" cover,
then the cover lifted and the page **blinked**: the splotch page's own `SplotchEditorSkeleton` for a moment, then
the real source, description and diagram. The Map side panel's create → open had the same blink.

## Why it was misleading

The overlay had already been "fixed" for a white flash (`46db0bce1`) by holding its cover over the iframe until
the iframe's `onLoad`. That removed the blank frame, and `onLoad` reads as "the page has loaded". It is not: the
blink moved from a white frame to the page's skeleton, and looked like a new bug.

## Why it happens

`load` fires when the framed document and its subresources (scripts included) have loaded. A client-rendered page
only starts its real work after that: it hydrates, reads the session, fetches its data, and draws a skeleton
until it has it. `SplotchPageClient` renders `renderRouteAwareSkeleton()` until `isMounted`, `isHydrated`,
`supabaseUser` and `isDataLoaded` are all set — every one of them after `load`.

## What to do

Have the framed page say when it is ready, and wait for that. Here the page posts `splotch:embed-ready` to
`window.parent` (same origin) from an effect gated on exactly the conditions its skeleton waits on, and the host
lifts its cover on that message, checking origin, `event.source === iframe.contentWindow` and the id
(`src/utils/splotch-embed-ready.ts`). Keep a fallback timer started on `load` so a page that never posts (an error
page, an older deploy) cannot hide behind the cover for good, and log when it fires.

When a cover over an iframe still blinks, ask what the framed page draws between `load` and its content before
tuning the host.
