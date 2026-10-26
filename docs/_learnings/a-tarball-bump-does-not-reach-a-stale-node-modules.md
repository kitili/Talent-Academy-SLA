# A tarball bump does not reach a stale node_modules

**Scope:** transferable
**Where:** the vendored yFiles tarball (`"yfiles": "file:./yfiles-<version>.tgz"` in `package.json`).
Found 2026-10-01 on `qa-fix-modal`, after `e2cc9f2c2` moved yFiles from 30.0.5 to 31.0.3.

## The symptom

```text
./src/utils/diagram-types/diagramTypes.ts:604:64
Type error: Property 'lastEventLocation' does not exist on type 'GraphComponent'.
Next.js build worker exited with code: 1
```

Vercel's `yarn run build` failed, while `npx tsc --noEmit` passed on the same commit locally.

## Why it was misleading

The bump changed only `package.json`, `yarn.lock` and the `.tgz`, so every merge or pull looked
like nothing a typecheck could disagree about. But a checkout's `node_modules/yfiles` stays on the
version it was last installed with until someone runs `yarn install`. A local typecheck therefore
checks the code against yFiles 30's typings, and the build, which installs fresh, checks it
against 31's. yFiles 31 removed `CanvasComponent.lastEventLocation` in favor of
`lastPointerEvent.location`, so four call sites compiled locally and failed on Vercel.

The replacement does not behave the same way either. `lastEventLocation` could be null-checked;
`lastPointerEvent.location` is always a `Point`, and it is `(NaN, NaN)` until the first pointer event,
so a `loc ? loc.x : 0` fallback has to become a `Number.isNaN` check.

## The check

After any change to a `file:` dependency, compare what is installed with what is pinned before
trusting a typecheck:

```bash
node -p "require('yfiles/package.json').version"   # must match the tgz named in package.json
yarn install --frozen-lockfile                       # if it does not
```

When a yFiles bump lands, grep for the members its release notes removed, since `next build`
reports only the first type error it hits.
