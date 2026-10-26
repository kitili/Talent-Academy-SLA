# Handoffs in this repository

The project-specific half of `skills/handoff-skill/SKILL.md`.

## Where they live

`handoff/`, one dated file per handoff: `handoff/YYYY-MM-DD-<topic>.md`. A pause note is not a handoff; it goes in the
ignored `tmp/paused-<date>.md` and is deleted on resume.

The steering engineer approves every push to `origin` and every deploy. Nothing is pushed or deployed on a worker's
or another orchestrator's say-so.

## Gathering the state

Run these in the main checkout and paste what they show, not what you remember:

```bash
git status --short
git log --oneline -10
git log --oneline origin/main..feat/improvements
git worktree list
git branch --list
node scripts/test-needed.mjs
```

`node scripts/test-needed.mjs` says whether the last green run (`.test-runs/last-green.json`) still covers the tree.
Also record any dev server left running (a preview or `npx tsx server/index.ts`): it holds port 5000 and writes to
the live database on start.

## Pausing on this machine

Windows, with Git Bash and PowerShell. Stop background test runs and any local server before pausing. Check for
leftover `node` processes with `Get-Process node` in PowerShell and end the ones this session started.

## This repository's traps to carry into every handoff

- **One database.** Local `.env` and production share one Neon database. Write down anything run against it this
  session: a local server start (it creates schema, resets test logins and deletes inactive accounts), a script under
  `scripts/` or `server/migrations/`, or `npm run db:push`.
- **No staging.** `main` is what ships; work happens on `feat/improvements`. Say how far `feat/improvements` is
  ahead of `origin/main`, whether it is pushed, and whether a merge into `main` is waiting on the engineer's approval.
- **Known type errors.** `npm run typecheck` reported 46 errors in app code on 2026-10-26 (none in tests or scripts).
  Give the count, so the reader can tell a new error from an old one.
