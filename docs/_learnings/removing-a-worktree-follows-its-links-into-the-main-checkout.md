# Removing a worktree follows its links into the main checkout

**Scope:** transferable
**Area:** `git worktree remove --force` on Windows; any worktree (`.claude/worktrees/<name>`) holding a directory
junction or symlink to a folder outside it, typically `node_modules` linked to the main checkout's so tests can run.
**Status:** open (a process rule: unlink before removal, by the worker and again by the orchestrator)

## The symptom

On 2026-10-21 a verify worker made a temporary worktree and linked its `node_modules` to the main checkout's with a
directory junction (`mklink /J node_modules <main checkout>/node_modules`), so it could run the tests. When it
finished it ran `git worktree remove --force` on that worktree. The main checkout's `node_modules` went from 1,541
entries to 12: everything from `@…` to `yfiles…` was deleted. Tracked files and branches were untouched, but nothing
in the main checkout could typecheck or run a test until `yarn install` restored it.

## Why it was misleading

A junction looks like a folder inside the worktree, and removing a worktree reads as "delete this folder and
everything in it". Deleting the junction itself (`rmdir <link>`) is safe and leaves the target alone, so a person who
has done that before expects the same from a recursive removal. `--force` also silences the refusal that would
otherwise have stopped on the untracked `node_modules`.

## Why it happens

A recursive delete that walks into a directory junction deletes the target's contents, because to the walker the
junction is just a directory with children. `git worktree remove --force` deletes recursively, and so do
`rm -rf`, `Remove-Item -Recurse` and plain file-manager deletes, depending on the tool and version. The safe way to
drop a link is to remove the link entry, never its contents.

## What to do

- **Prefer not to link.** Run the main checkout's tools by absolute path instead (`node <main>/node_modules/typescript/bin/tsc`),
  or install in the worktree.
- **The worker, as its last step after its tests:** remove every link it made, with `rmdir <link>` in `cmd` (or
  `(Get-Item <link>).Delete()` in PowerShell), and say so in its report.
- **The orchestrator, before any `git worktree remove`:** list the links in the worktree and unlink them first. In
  PowerShell: `Get-ChildItem <worktree> -Force -Recurse -Depth 2 -Attributes ReparsePoint`, then `cmd /c rmdir "<link>"`
  for each one. Only then remove the worktree, and avoid `--force` where a plain `remove` would do.
- **If it has already happened:** run `yarn install --immutable` in the main checkout. Tracked files are safe; check
  `git status`.
