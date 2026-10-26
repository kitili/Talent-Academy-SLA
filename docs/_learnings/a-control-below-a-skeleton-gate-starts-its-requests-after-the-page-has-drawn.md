# A control below a skeleton gate starts its requests after the page has drawn

**Scope:** transferable
**Area:** React pages that render a skeleton until some queries answer, and components below that gate that fetch
their own data; here `ProjectOverview` and `ProjectTitleActions`, and `useAuth` (`src/hooks/useAuth.ts`); 2026-10-10.
**Status:** fixed for the overview's workstream list (2026-09) and settings gear (2026-10-10). The general trap is open.

## The symptom

On the project overview the settings gear beside the title "often appears very late, even after the rest of the
page has rendered". The request it waits on (`GET /api/organizations/{orgId}/project-summaries`) was missing from
the page's first wave of requests entirely.

## Why it was misleading

The gear's own hooks looked fine: one list query, enabled once the reader is known, deduped by key. Read in
isolation, nothing in the component waits on anything else. The wait is in where it is mounted.

## Why it happens

A component rendered inside a page's loaded branch does not exist until the page's gate opens, so none of its
hooks run and none of its requests leave until the page has already drawn. Here it compounded: the gear called
`useAuth()`, which keeps per-instance state and calls Supabase Auth's `getUser()` over the network on mount, and
its list query was enabled only once that answered. So the gear waited for the page, then an auth round trip,
then the list. A browser fixture with the objective request held open showed the list was never requested
while the page was on its skeleton.

## What to do

- For any control below a gate, ask which requests it starts and when. If it has its own data, start that query
  in the gated page on its first render (the result is only a warm cache; react-query dedupes by key) and leave
  it out of the gate.
- Do not call a per-instance auth hook in a child the parent could pass the id to: each instance is another
  network round trip on mount. Call it once above the gate and pass the id down.
- A warm-up observer that reads nothing should pass `notifyOnChangeProps: []`; an observer that tracks no field is
  notified of every change and redraws the page each time.
- A second observer of a `refetchOnMount: 'always'` query mounting after the first has answered fetches again;
  give the later reader `refetchOnMount: false`.
- Test it by order, not time: hold one gated request open and assert the control's request is still issued.
