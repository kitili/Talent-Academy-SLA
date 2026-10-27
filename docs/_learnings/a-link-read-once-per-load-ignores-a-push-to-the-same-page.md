# A link read once per load ignores a push to the same page

**Scope:** transferable
**Area:** the workstream screen's `?report=` / `?reportVersion=` / `?section=` / `?threadId=` handling (`WorkstreamClient.tsx`, `parseReportDeepLink` in `src/utils/project-actions/project-routes.ts`), and anything that links into it from a mounted page, such as the header Inbox (`ProjectsHeaderInbox.tsx`).
**Status:** designed around on 2026-10-07 for report comment links in the header Inbox (`plans/live-report/14-section-comments-plan.md`); open for any other in-app link into an already-open workstream.

## The symptom
Click a report comment in the header Inbox while the same workstream is already open. The URL changes to `…?report=<id>&reportVersion=2&section=…&threadId=…`, but nothing on screen moves: no tab opens, no version switches, no thread opens. Paste the same URL into a new tab and it lands on the passage.

## Why it was misleading
The address is right and the page renders it from a fresh load, so the link looks correct, and its unit tests pass. The fault only shows when the page is already mounted, which a test that loads the URL fresh never exercises.

## Why it happens
The screen reads its arrival parameters once per page load, behind a ref, on purpose: `panel.open` clears a dismissed tab, so re-running whenever the URL or the opener's identity changed would reopen a tab the reader had just closed (`docs/live-report/architecture.md`, *Placement and URL state*). In a client-side router, `router.push` to the same route keeps the component mounted, so the once-per-load effect never runs again.

## What to do
- Before linking into a screen from inside the app, find out whether that screen reads its query once per load or on every change. Its tests usually pin which.
- If it reads once per load, follow the link with a full navigation (`window.location.assign`), as the header Inbox does for items with a server `sourcePath`. The alternative is to make the screen react to changes in those parameters. That reopens the dismissed-tab problem and needs the once-per-load contract tests changed.
- Test the journey from a page that is already mounted, not only by loading the URL fresh.
