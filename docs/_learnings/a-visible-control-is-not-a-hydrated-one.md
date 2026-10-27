# A visible control is not a hydrated one

**Scope:** transferable
**Area:** browser fixtures (`tests/browser-fixtures/*.spec.ts`) against the dev server; any
Playwright spec that clicks a server-rendered control on a heavy route.
**Status:** open — the trap is in the environment, not designed out. `system-graph.spec.ts` shows the
guard to copy.

## The symptom

A new fixture spec for the Map & Schema toolbar waited for the toolbar to be visible, then clicked a
suggestion chip and a tab. Both tests failed. The page snapshot at failure showed the toolbar, the
scope chip reading **"Entire System · 0 loaded"**, no yFiles canvas, and the tab still on Map after the
click. The failure screenshot had the Next dev **"Compiling …"** badge in the corner.

The same page, opened in a browser a minute later, drew the graph and every control worked.

## Why it was misleading

Playwright's `toBeVisible()` on the toolbar passed. It was visible — as **server-rendered HTML**. The
first request to a yFiles-heavy route pays the dev server's cold compile of the client bundle (well
over a minute on a laptop); until that bundle arrives React has not hydrated, so no effect runs (the
graph is never built, counts stay at zero) and no handler is attached (clicks land on inert markup).
Nothing errors. The spec then either times out on the next assertion or, worse, asserts on the
server-rendered defaults and passes for the wrong reason.

The pre-existing `functional-record-graph.spec.ts` never hit this only because its fixture route is
smaller and compiles inside its 30 s wait.

## The check

Before interacting, wait for something **only the hydrated client can produce**, with a budget sized
for a cold compile:

```ts
await expect(page.locator('.yfiles-canvascomponent').first()).toBeVisible({ timeout: 240_000 })
await expect(summary).not.toHaveText('0 of 0 elements', { timeout: 60_000 })
```

and raise the test timeout (`test.setTimeout(300_000)`) so the wait is not cut short by the config's
2-minute default. A visible button, a heading, or any text that exists in the SSR output is not such a
marker.

## Evidence

- First run: both tests failed; `test-results/…/test-failed-1.png` shows "Compiling …";
  `error-context.md` shows `text: Entire System · 0 loaded` with no canvas node.
- After adding the hydration wait (`openHydratedFixture` in `tests/browser-fixtures/system-graph.spec.ts`):
  2 passed in 2.8 min, of which most was the cold compile.
