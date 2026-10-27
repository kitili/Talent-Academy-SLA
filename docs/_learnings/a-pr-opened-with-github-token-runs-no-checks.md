# A PR opened with GITHUB_TOKEN runs no checks

**Scope:** transferable

## The symptom

A workflow opens a pull request with the default `GITHUB_TOKEN`
(`gh pr create`, or `peter-evans/create-pull-request` with no token). The PR
appears, but lint, tests and Playwright never start. If those checks are
required, the PR sits at "Expected — Waiting for status to be reported" and
cannot merge.

## Why it was misleading

Nothing errors. The PR looks like any other, and the checks seem to be "still
queued". GitHub deliberately does not trigger new workflow runs from events
caused by `GITHUB_TOKEN`, to prevent recursive runs. That covers `pull_request`
and `push` on the PR branch.

The same trap has a close relative: a commit whose message contains
`[skip ci]` (or `[ci skip]`, `[no ci]`, `[skip actions]`) suppresses `push`
**and** `pull_request` runs for that head commit. That tag is a common way to
stop a write-back loop, and it silently disables the PR's own checks once
the write-back goes through a PR.

## The check

- Open bot PRs with a GitHub App installation token
  (`actions/create-github-app-token`) or a fine-grained PAT, not `GITHUB_TOKEN`.
  Events from those tokens trigger workflows normally.
- Keep `[skip ci]` off commits that will be the head of a PR. Stop loops with a
  path filter or an idempotent no-op instead.
- After the first bot PR, confirm the checks actually ran, rather than
  assuming they are queued.

## Where this applies

`classify-help-center.yml` and `sync-mirror-to-plain.yml` both open PRs. They
use the App token when `vars.HELP_CENTER_BOT_APP_ID` is set and fall back to
`GITHUB_TOKEN` otherwise. In that case close and reopen the PR by hand to start
its checks.
