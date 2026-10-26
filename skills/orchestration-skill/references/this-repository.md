# Orchestration in this repository

The project-specific half of `skills/orchestration-skill/SKILL.md`.

## Where things live

- **Working branch:** `feat/improvements`. Tasks branch from it and merge into it. `main` is production
  (`origin/main` on `github.com/kitili/Talent-Academy-SLA`, deployed by Vercel); `feat/improvements` merges into
  `main` only with the steering engineer's go-ahead. Older agent branches named `cursor/*` sit on the remote; they are
  not the working branch.
- **Worktrees:** `.claude/worktrees/<task>/`, one per task, on its own branch from the working branch's `HEAD`
  (gitignored).
- **Plans:** `plans/`. **Handoffs:** `handoff/`. **Deferred work:** `tasks/`.
- **Worker log:** `docs/_global/worker-performance/log.jsonl` (how to read it: its `README.md`).
- **Machine capacity:** none recorded yet. Until it is, run one full suite at a time on this machine.

## Fixed limits for every brief

- Reset to `<sha>` before any edit if you are not on it.
- Stay inside the files this brief names; commit to your own branch; never push, stash, or switch another checkout.
- **Never load `.env` and never start the server.** `.env` points at the live database, and server start-up writes to
  it (schema, test logins, and deleting inactive accounts).
- Long runs go in the background, logged under the worktree's `tmp/`.
- Commit a "(WIP)" checkpoint after each step of edits and before any long run.
- Run the focused tests for what you changed, for example `npx tsx --test tests/<file>.test.ts` or
  `node scripts/run-node-tests.mjs unit`, plus `npm run typecheck`. Do not run the full `npm test`.
- Use `npm`; this repository has `package-lock.json`.

## Cross-cutting checks after a merge

- `npm test` once (the older suite, then the kit runner), and `npm run typecheck`.
- `npm run build` when the client, the server entry, `vite.config.ts` or `vercel.json` changed: the Vercel build
  bundles both sides, and a type-stripping test run will not catch a bundle error.
- Grep for the changed rule in both `client/src/` and `server/`; the same rule often lives in both.

## Scheduling limits

`server/routes.ts` (about 6,800 lines) and `server/storage.ts` (about 3,600) hold most of the server. Two tasks that both edit
either file run in sequence. Pages in `client/src/pages/` are usually one file per desk and can run in parallel.

## Model choice here

Opus for anything touching sign-in, sessions, role checks (`isAdmin`, `isTrainer`, `isTeacherAuthenticated`),
quiz scoring and completion, certificates, start-up writes, or SQL. Sonnet for page layout and copy, text contracts,
and docs. No Sonnet bands are recorded yet.

## Launching workers here

Each worker gets a worktree from `HEAD`. `node_modules` is not shared, so a worker either runs `npm install` in its
worktree or links `node_modules` from the main checkout; unlink that link before removing the worktree.

## Traps seen here

- `.env` and server start-up write to the live database (above).
- Text-contract tests that match `\n` fail on Windows checkouts (`core.autocrlf=true`); match `\r?\n`.

## Moving a fix to `qa` here

There is no `qa` or staging branch. Work lands on `feat/improvements`; a fix production needs sooner is built from
`main` and merged into both, as `SKILL.md` describes, with the steering engineer's go-ahead.
