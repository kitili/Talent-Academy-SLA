# A local start from an old checkout runs its old writes on the live database

**Scope:** this repository
**Area:** `server/app.ts`, `server/ensureTestLogins.ts`, `server/deskRoster.ts`, `.claude/launch.json`, `.env`
**Status:** open as a trap; `.claude/launch.json` on this machine no longer loads `.env`

## The symptom

Someone asked for the app on the local server. It started from `.env`, and the log printed a Neon host, not a local one. Nothing looked wrong: the sign-in page loaded.

## Why it was misleading

"Local server" reads as a local copy. Here the local `.env` is the one live database, and start-up writes to it. Worse, the checkout was `main` from before a pull. Its start-up still ran `removeInactiveDesks()`, which deleted inactive people and rows tied to them, code the newer branch had already removed. Reading the current code would not have shown this: what runs is the checkout, not the repository's latest.

## Why it happens

A start-up task runs with whatever code is on disk, against whatever database the environment names. Neither is checked against the other, and start-up writes have no dry run.

## How to avoid it

Before starting a server here, read which database it will use. Use a local Postgres (`docs/academy-desk/workflow-walkthrough.md`) and pass only that URL. Pull before any start that could touch live. Look for writes in `server/app.ts` first, rather than after.
