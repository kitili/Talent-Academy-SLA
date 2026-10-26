# The first skeleton can belong to the page that redirected you

**Scope:** transferable
**Area:** loading fallbacks, `src/app/page.tsx`, the organization root
`src/app/organizations/[orgId]/loading.tsx`; 2026-09-23.
**Status:** fixed for the organization landing. The general trap is open.

## The symptom

Opening the app showed the legacy organization skeleton — top bar, a left nav
with two rows, a three-column grid of thumbnail cards — which then gave way to
the projects landing skeleton and the list. It read as the page loading twice,
with the first screen belonging to a page that no longer exists.

This had already been "fixed". Commit `2729ebf45` changed the organization
root's `loading.tsx` from `OrganizationSkeleton` to `ProjectsLandingSkeleton`
and added a contract test asserting it. The test passed. The screen did not
change.

## Why it was misleading

The report was about the organization page, so the fix went to the
organization route's fallback, which was genuinely wrong. But the reader rarely
*arrives* at that route. They open `/`, and `src/app/page.tsx` is a client page
that looks up the caller's organizations and then `router.push`es to the first
one. For the whole lookup it drew its own loader, and that loader was:

```ts
// src/components/loaders/OrgSwitcherSkeleton.tsx (removed)
export { default } from './OrganizationSkeleton'
```

The alias's name says "org switcher", so nothing about it reads as the legacy
page's skeleton, and a check that only asked what the route's `loading.tsx`
imports could never see it. The skeleton on screen came from the page *before*
the redirect.

## The check

When a loading screen looks wrong, find what drew it before trusting the
route's `loading.tsx`:

1. Take the URL the reader actually opens, not the one they end up on. If it
   redirects client-side, that page's own return value is the first frame.
2. Grep for the component *and its file path*, not its identifier:
   `git grep -n "loaders/OrganizationSkeleton\|/OrganizationSkeleton'" src`
   finds re-exports under other names; grepping `OrganizationSkeleton` as a JSX
   tag does not.

The guard that was in place was a sweep, not a name check:
`tests/integration/project-actions/project-screen-skeleton-contract.test.ts`
walked `src/` and failed if any module outside `organizations/[orgId]/legacy/`
imported or re-exported `loaders/OrganizationSkeleton`. `/` now renders the
organization root's own `loading.tsx` component, so the wait is one shape across
the redirect.

(2026-10-09: the legacy page and `OrganizationSkeleton` itself were deleted
(`plans/legacy-pages/legacy-pages-inventory.md`, D1), so the trap is designed
out and the sweep test was removed with them. The check above still applies to
any other page that redirects client-side.)
