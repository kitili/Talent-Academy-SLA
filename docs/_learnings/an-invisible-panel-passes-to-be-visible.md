# An invisible panel passes `toBeVisible`

**Scope:** transferable
**Area:** browser fixtures that mount `AgentPanel` (or anything built from framer-motion's `m.*`
components) outside the screen that normally hosts it.
**Status:** open — the panel still depends on a provider its hosts supply. Both `AgentPanel` fixtures
(`code-view`, `agent-panel-map-link`) now wrap it, and both specs assert the body's `opacity` is `1`,
which fails ("Received: 0") with the wrapper removed.

## The symptom

A new fixture mounted the real `AgentPanel` over a generated `.js` file. Every assertion passed: the
tab was clicked, `JavaScript · 11 lines` was visible, the coloured `hljs-keyword` span was visible,
the copy button was visible. The screenshot showed the tab strip and **a completely blank body**.

## Why it was misleading

Two true things combine:

- `AgentPanel` animates each tab's body in with `m.div` (`initial={{ opacity: 0 }}`). `m.*` is the
  lazy flavour of framer-motion: it animates only inside a `<LazyMotion features={…}>`. The real
  screens get one from `PanelSlide`. Mounted without it, the body is committed at its *initial*
  style and never moves — opacity 0, for good. Nothing warns.
- Playwright's `toBeVisible()` does **not** consider opacity. An element at `opacity: 0` with a
  non-empty box is "visible", and clicks land on it too.

So a fixture that forgets the provider asserts on text no person can see, and passes.

## The check

- When a fixture mounts a component outside its real host, find what the host wraps it in:
  `grep -rn "LazyMotion" src` names `PanelSlide`, `Transcript`, `ChatPanel`, `AgentStepper`.
  Wrap the fixture the same way (`<LazyMotion features={domAnimation}>`).
- Assert the body is drawn, not merely present:
  `expect(page.getByRole('tabpanel').locator('> div').first()).toHaveCSS('opacity', '1')`.
- Take one screenshot in the spec (`page.screenshot({ path: test.info().outputPath(…) })`) and look
  at it once. A text assertion cannot tell a drawn panel from a transparent one.

## Evidence

- `tests/browser-fixtures/implementation/app/test-fixtures/code-view/CodeViewFixture.tsx`: blank
  body in the first screenshot, drawn after wrapping `AgentPanel` in `LazyMotion`; the four specs in
  `code-view.spec.ts` passed both times.
- `AgentPanel.tsx`: the body's `m.div` with `initial={reduced ? false : { opacity: 0, y: 4 }}`.
- `agent-panel-map-link`'s fixture mounted `AgentPanel` without a `LazyMotion` too, and its specs
  clicked links in that body — which Playwright allows at opacity 0 — and passed. Fixed the same
  way; with the wrapper removed again, its new opacity assertion fails with `Expected "1", Received "0"`.
