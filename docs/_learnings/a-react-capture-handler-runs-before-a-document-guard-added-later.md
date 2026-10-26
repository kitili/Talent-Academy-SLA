# A React capture handler runs before a document guard added later

**Scope:** transferable
**Area:** click handlers in the Next.js app router; `OrganizationShell.tsx` (`onClick`), `OrganizationSettingsView.tsx` (the unsaved-changes guard); 2026-10-19.
**Status:** fixed for the organization shell on 2026-10-19 (commit `a4e5358b3`: the shell listens on the bubble phase).

## The symptom

With "a click on any shell link shows the target page's skeleton" (loaders D3), a click on a sidebar link from Settings
with an unsaved draft would have swapped the page for the skeleton: the draft and the "leave this page?" prompt drawn
over it were unmounted. The prompt is a guard that stops the click; the shell acted on the click anyway. The same flaw
already existed for a sidebar link into another organization.

## Why it was misleading

The guard calls `stopPropagation()` on a capture listener on `document`, and the shell's handler was `onClickCapture`.
Reading the two as "the guard is a capture listener on an ancestor, so it runs first" is wrong here.

## Why it happens

In the app router React's root container is `document`, and React listens for events there. Listeners on one node run
in registration order, and React's were registered first. So React's `onClickCapture` handlers run **before** a capture
listener a component adds to `document` later, and the guard's `stopPropagation()` comes too late for them. A bubble
phase handler (`onClick`) runs after, and a stopped click never reaches it. Separately, `event.defaultPrevented` is no
use to tell "somebody cancelled this": `<Link>` calls `preventDefault()` itself when it navigates.

## What to do

- To act only on clicks nobody stopped, listen on the **bubble** phase; do not read `defaultPrevented` where `<Link>` is
  in the path.
- Pin the order with a test that mounts the real component and registers a guard after it: the guard stops the click, and the page
  stays (`tests/unit/organization-shell/shellPendingState.test.ts`).
