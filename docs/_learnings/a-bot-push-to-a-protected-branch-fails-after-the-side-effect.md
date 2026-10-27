# A bot push to a protected branch fails after the side effect

**Scope:** transferable

## The symptom

Every run of `sync-mirror-to-plain.yml` went red on its last step:

```
remote: error: GH013: Repository rule violations found for refs/heads/staging
remote: - Changes must be made through a pull request.
! [remote rejected] staging -> staging (push declined due to repository rule violations)
```

Runs `32032915949` (2026-08-17), `32231851648` (2026-08-19) and `32868777490`
(2026-08-25), every run to date.

## Why it was misleading

The red run looks like "the sync failed, nothing happened". The opposite is
true. The `Sync changed articles to Plain` step had already **succeeded**: articles
were created and updated on the live Help Center. Only the write-back of the ids
Plain assigned was rejected, so Plain and git silently diverged. New articles
were live while every branch still said `articleId: null`. A retry does not
help, because it fails at the same place every time.

Two other things made it look like it should work:

- The job had `permissions: contents: write`. That grants the token write
  access, but a repository **ruleset** (here "Main & staging Branch Protection",
  id 1938179) applies on top of it, and `github-actions[bot]` is not exempt.
- The workflow was tested locally with `DRY_RUN=1`, which never reaches the
  push.

## The check

Before writing a job that ends in `git push origin <branch>`, list the rulesets
on that branch:

```bash
gh api repos/<owner>/<repo>/rulesets --jq '.[] | select(.enforcement=="active") | .name'
gh api repos/<owner>/<repo>/rules/branches/<branch>
```

If a `pull_request` rule is active, the job has to open a PR. Also put the
irreversible step (the external API call) *after* anything that can be rejected,
or make the write-back step run on partial failure (`if: !cancelled()`), so a
rejection never loses data the external system already holds.

## Status

Designed out on 2026-10-01: the write-back now opens an
`auto/help-center-ids-<run_id>` PR. See `docs/help-center-sync/operations.md`.
