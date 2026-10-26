# dontAsk refuses a command without saying which

**Scope:** transferable

## The symptom

The Help Center classifier (`classify-help-center.yml`) went green and opened PR #2199, which documented nothing.
The PR only moved `.plain/last-sync.json` from `7563587` to `f05ef62`. Claude's own summary said:

> Bash was denied in this run, and the range needs `git diff` over `src/`, `workers/` and `migrations/` … I made the conservative choice, which is no edit.

That was run `37851779544`, attempt 3, on 2026-10-08. It ran
`claude -p … --permission-mode dontAsk --allowedTools "Read,Glob,Grep,Edit,Write,Bash(git diff:*),Bash(git log:*),Bash(git show:*)"`,
so `git diff` was on the allowlist.

## Why it was misleading

- **The allowlist reads as "git diff works".** It only matches commands of exactly that shape. Anything else is a different command to the permission check: a pipe (`git diff … | head`), a chain (`cd x && git diff`), or a flag before the subcommand (`git --no-pager diff`, `git -C dir diff`).
- **dontAsk refuses quietly.** The CLI's `-p` output doesn't print which command was refused, and the job log has only Claude's final summary. Nobody can see what was actually tried.
- **The run stays green.** Claude follows "be conservative when unattended", makes no edit, and the workflow still advances its marker. Merging that PR would have marked six weeks of changes as documented when none had been reviewed.

We never found out which command was refused. That gap is the point of this entry.

## What to do

- **For an unattended run, give the model the data instead of the command.** Compute whatever it needs in a deterministic step beforehand and write it to files, then allow only `Read`/`Grep`. A file can't be refused because its command was shaped wrong.
- **If a run really needs a command, check a refusal before trusting the result.** Run with `--output-format stream-json --verbose` so the refused tool calls appear in the log. Treat "no edits" combined with a mention of denied tools as a failure, not a quiet success.

## Status

Designed out on 2026-10-09. `prepare-classifier-run.mjs` writes `commits.txt`, `files.txt` and `code.diff` to `$RUNNER_TEMP/classifier-input/`, and the classifier now runs with `Read,Glob,Grep,Edit,Write` and no Bash. See `docs/help-center-sync/architecture.md`.
