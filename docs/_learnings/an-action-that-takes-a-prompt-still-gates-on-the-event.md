# An action that takes a prompt still gates on the event

**Scope:** transferable

## The symptom

Every run of `classify-help-center.yml` went red on its `Run the classifier` step:

```
##[error]Action failed with error: Unsupported event type: push
```

Runs `37032464115` (2026-10-02) and `37111880060` (2026-10-03), every run to date.
Claude never started, so no docs PR was ever opened and the marker never moved.

## Why it was misleading

`anthropics/claude-code-action@v1` accepts a free-form `prompt` input, which reads
as "run this prompt, whatever fired the workflow". It is not. The action parses
the triggering event before it looks at the prompt, and that parser
(`src/github/context.ts`) only knows `issues`, `issue_comment`, `pull_request*`,
`workflow_dispatch`, `repository_dispatch`, `schedule` and `workflow_run`. Any
other event throws. Upgrading does not help: `v1.0.241` (2026-10-03) and `main`
have the same list.

The workflow also had `workflow_dispatch`, which the action does accept, so a
manual run from the Actions tab would have hidden the problem.

## What to do

Before wiring a third-party action into a workflow, check that it supports the
event you trigger on, on the version you pin. Search its source for the event
switch (`grep -n 'case "' src/github/context.ts`), and test with the real
trigger, not `workflow_dispatch`.

If the job only needs Claude to edit files, and the workflow does its own commits
and PRs, call the CLI directly. It doesn't care what the event was:
`npx -y @anthropic-ai/claude-code@<version> -p "$PROMPT" --permission-mode dontAsk --allowedTools ...`.
`dontAsk` refuses any tool that isn't on the allowlist instead of waiting for a
prompt nobody will answer. It refuses silently, though, and a `Bash(...)` allowlist entry
matches less than it looks: see
[dont-ask-refuses-a-command-without-saying-which.md](dont-ask-refuses-a-command-without-saying-which.md).

## Status

Designed out on 2026-10-05: `classify-help-center.yml` calls the pinned CLI. See
`docs/help-center-sync/architecture.md`.
