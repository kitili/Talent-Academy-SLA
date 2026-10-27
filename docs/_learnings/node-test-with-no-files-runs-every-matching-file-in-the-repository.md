# `node --test` with no files runs every matching file in the repository

**Scope:** transferable
**Area:** running a focused subset of tests from a shell, especially with a computed file list
(`node --import tsx --test $(git grep -l …)`).
**Status:** open; the habit below is the guard.

## The symptom

On 2026-10-08 the orchestrator meant to run "the tests that read the learnings index" with
`node --import tsx --test $(git grep -l "_learnings/README" -- tests)`. No test reads that file, so the command
substitution was empty and Node ran `node --test` with no file arguments. Node then **discovers test files by
pattern from the current directory**. On Node 24 the patterns include TypeScript: `**/*.test.ts`, `**/*-test.ts`,
`**/*_test.ts`, `**/test-*.ts`, `**/test.ts` and anything under a `test/` folder, in every directory except
`node_modules`.

The run picked up more than 3,000 files:
- 1,121 under `tests/`;
- 2,154 inside agent worktrees under `.claude/worktrees/`;
- 15 elsewhere, among them `scripts/decode-savedsearch-test.ts`, a manual script that wrote two XML files into
  `scripts/`. Those files then made `yarn test:needed` and `yarn test:docs` report covered changes nobody had made,
  and their origin took a while to trace.

## Why it was misleading

The command looked focused, and an empty substitution gives no error. A manual script named `*-test.ts` or
`test-*.ts` looks like a test to Node, so it runs with all its side effects. Here the side effect was only two
files, but a script that calls a database or an API would have run too. That run had no `--env-file`, so no
credentials were present; one with them would have been worse.

## The check

Never pass a computed file list to `node --test` without checking it isn't empty:

```bash
F=$(git grep -l "<pattern>" -- tests)
[ -n "$F" ] && node --import tsx --test $F || echo "no matching tests"
```

Also, when a manual script under `scripts/` or `src/` is named like a test (`*-test.ts`, `test-*.ts`), rename it
or move it under a folder that is never a test root.
