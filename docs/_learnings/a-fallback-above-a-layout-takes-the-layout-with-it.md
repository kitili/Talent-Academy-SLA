# A fallback above a layout takes the layout with it

**Scope:** transferable
**Area:** Next.js app router loading boundaries (`loading.tsx`), a persistent shell (sidebar and bar) drawn by a layout; `src/app/organizations/[orgId]/loading.tsx` and `(shell)/layout.tsx`; 2026-10-18.
**Status:** designed out on 2026-10-19 by `plans/systems/consistent-loaders-plan.md` (D1: `[orgId]/loading.tsx` deleted, the shell pages wait in `(shell)/loading.tsx`).

## The symptom

Switching from an organization's Systems page to a managed account's showed "strange skeleton loaders" in turn: a
full-page skeleton with **no sidebar and no top bar**, then the shell back with a second, differently shaped skeleton,
then the page. Recorded on the preview with a `MutationObserver` in the page after `router.prefetch` of the target and a
`router.push`:

```
27 ms   shell absent, "Loading projects..." (the landing skeleton, full page)
533 ms  shell back, "Loading projects..." inside it (the page's own data gate)
1743 ms the page
```

## Why it was misleading

- A `loading.tsx` reads as "the page is loading", so the report was taken as "the skeletons are the wrong shapes" and
  a first pass looked only at their sizes. The shell had a loading file of its own (`(shell)/loading.tsx`), which made
  the structure look right.
- It would not reproduce. With a 3 s delay on the RSC request the old shell simply stayed on screen until the response,
  and the hard-load HTML already contained the shell. The cause was not slowness.

## Why it happens

A `loading.tsx` is the Suspense fallback of **everything under its segment, layouts included**. `[orgId]/loading.tsx`
sat above `(shell)/layout.tsx`, so whenever that boundary was shown, the shell was not. Two things show it:

1. The `[orgId]` segment is keyed by its value, so a move to another organization is a different segment and the old
   subtree is unmounted (measured: the shell element is replaced on every cross-organization move, kept on a
   same-organization one).
2. **A prefetched target renders its prefetched tree down to the first `loading.tsx` at once** (the instant loading
   state). That first boundary was `[orgId]/loading.tsx`, above the shell. `next dev` does not prefetch, which is why a
   local run and an unprefetched click never showed it.

The same file was also the first frame for the project pages, inbox and checkout (soft move from the Overview: a
landing skeleton at 26 to 472 ms, recorded 2026-10-18), which is why it had been left in place.

## What to do

- Put a boundary **below** the persistent chrome, never above the layout that draws it. With a layout and a
  `loading.tsx` in the same folder the layout survives; with the `loading.tsx` one folder up it does not.
- To test a loading state, use a production build and `router.prefetch` the target before the click; check that the
  chrome is in every recorded frame. A fixture tree that mirrors the route tree (`tests/browser-fixtures/implementation/app/test-fixtures/organization-shell-switch/`,
  `with` against `without` the outer file) isolates the boundary from the app's data.
- Do not read a verdict from a dev-server browser run: `next dev` can reload the document on a first visit while it
  compiles (no Fast Refresh message), which looks like a blank frame or a second document load. Those cases decide on a
  production run (`SWITCH_FIXTURE_PRODUCTION=1`).
- Before deleting a boundary, record what the routes it covered draw first, and give each one a boundary of its own
  (here the inbox and checkout got `loading.tsx` files; project pages and canvases already had one).

Related: `the-first-skeleton-can-belong-to-the-page-that-redirected.md` (the first frame can come from a different file
than the one you are editing).
