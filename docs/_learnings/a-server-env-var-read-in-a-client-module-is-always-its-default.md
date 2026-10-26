# A server env var read in a client module is always its default

**Scope:** transferable
**Area:** constants in `src/constants/constants.ts` (or any module) that read `process.env` and are imported
by a `'use client'` component. Found 2026-10-03 while removing the foreground Drive/GitHub ingestion
(`plans/code-ingestion/foreground-ingestion-deprecation-plan.md`).

## The symptom

Until 2026-06-08 the switch that chose between the browser ("foreground") and background ingestion
pipelines read:

```ts
export const USE_FOREGROUND_IMPLEMENTATION: boolean =
    process.env.USE_FOREGROUND_IMPLEMENTATION === 'true'
        ? true
        : process.env.USE_FOREGROUND_IMPLEMENTATION === 'false'
          ? false
          : true // Default to foreground processing
```

Its only reader was `AddFromLinkModal.tsx`, a `'use client'` component. PROD shows Google Drive
repositories saved without a background job (the foreground pipeline's signature) through May and into June
2026. The comment above the later hard-coded `false` still promised "can be overridden by environment
variable USE_FOREGROUND_IMPLEMENTATION" months after anything read it.

## Why it was misleading

The expression looks environment-driven: set the variable on Vercel and the app follows. That is true on
the server. In the browser bundle it is not: Next.js inlines only `NEXT_PUBLIC_*` variables (and anything
`next.config` exposes through `env`, which did not include this one) into client code, so the read is
`undefined` and the ternary falls through to its default. Setting `USE_FOREGROUND_IMPLEMENTATION=false`
on the deployment could not have moved the browser to the background path; the constant only changed when
the code changed.

**This explanation is an inference, not a reproduction.** It follows from Next.js's documented inlining
rule, the module's `'use client'` directive and the history (`git log -G "USE_FOREGROUND_IMPLEMENTATION:
boolean" -- src/constants/constants.ts`), and it matches the PROD rows. Nobody built the old bundle and
inspected the value.

The same shape hides anywhere a shared constants file is imported by both server and client code: the
server and the browser can disagree about one exported constant, with no error on either side.

## The check

- For a constant that reads `process.env.X`, find who imports it. If any importer is a client component
  (or imports one), the browser sees the default unless `X` starts with `NEXT_PUBLIC_` or is listed in
  `next.config`'s `env`.
- Prefer a code-static constant for a switch the browser reads (as `USE_FOREGROUND_IMPLEMENTATION` became),
  and say so in its comment; delete a comment that promises an override nothing reads.
- When the live value matters, measure it from durable rows (here: `code_versions` with no
  `background_job_id`), not from the deployment's environment settings.

## Status

Designed out for this switch: the foreground pipeline and `USE_FOREGROUND_IMPLEMENTATION` were removed on
2026-10-03. The trap applies to any other constant with the same shape.

Related: [a-documented-entry-point-can-be-unreachable.md](a-documented-entry-point-can-be-unreachable.md),
[a-wiring-test-that-reads-the-dead-path.md](a-wiring-test-that-reads-the-dead-path.md)
