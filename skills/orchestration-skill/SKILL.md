---
name: orchestration-skill
description: Use when the thread the user talks to runs as an orchestrator, planning work, delegating it to workers in separate worktrees and integrating their results, or when deciding whether to delegate at all. Covers the two phases (plan, then build after sign-off), drawing task boundaries by file ownership and fixing shared contracts first, choosing each worker's model, writing the brief (references/brief-template.md), what the orchestrator does while workers run, reviewing and merging finished work, the worker performance log, and cleaning up. Handing work to another orchestrator, pausing workers, and the end-of-day or overnight report are in handoff-skill. The core method is portable; references/this-repository.md holds this repository's paths, commands and traps.
---

# Orchestration Skill

## Purpose

An orchestrator is the thread the user talks to. It plans, talks with the user, delegates approved work to workers,
and consolidates their results, so it stays free while workers build. Workers see nothing of the conversation: the
brief is all they know, and the orchestrator's review is the only check between their work and the working branch.
Without support for subagents and separate worktrees, follow the same method sequentially.

**This file is the portable core.** For paths, commands and this repository's traps, read
`references/this-repository.md`. For the brief, use `references/brief-template.md`.

## When To Delegate

- Delegate work that is sizeable and independent. Each worker costs a full context; a small fix is faster done in the
  thread.
- Do it in the thread when the change spans every other task's files (a rename, a move, a rules edit). Only the
  orchestrator sees every branch, so only it can time such a change for a moment when no worker holds those files.

## The Two Phases

- **Phase 1, diagnose and plan.** A worker may be sent to investigate and write the plan: evidence, root cause,
  proposed fix, decisions with a recommended option, files it would touch, test plan. It commits the plan to its own
  branch and stops.
- **Phase 2, build.** Starts only after the user signs off, and goes back to the same worker, which still has the
  context. A worker never moves on to phase 2 by itself. Bring the phase-1 commits onto the working branch by merge or
  fast-forward first, so the worker's branch stays an ancestor and its base check fast-forwards; a cherry-picked copy
  leaves its branch diverged. If the worker can no longer be messaged (another session
  spawned it), a fresh worker restarts from the written plan.
- **Phase 0, probes.** When a plan rests on live facts nobody has checked, run the read-only probes first, as their
  own task, and relay the results to the builders before they fix field names or scope. Probes can remove whole tasks.

## Reviewing A Plan Before The User Sees It

- Check the evidence, reconcile plans that touch the same area, and present the decisions with the recommended option
  first.
- Where the work touches security, access or data boundaries, the plan must say plainly whether a real gap exists
  today.
- Give the user a link to the raw plan file alongside your review, so the relay can be checked against its source. The
  link points into the worker's worktree until the plan is merged, and to the working branch's copy after.

## Task Boundaries And Shared Contracts

- The plan names each task's boundary: what it builds, the files it owns, the contracts it shares with other tasks,
  its tests, and its model with a one-line reason. The orchestrator chooses the boundaries; the user approves them with
  the plan.
- Draw boundaries by file ownership. Tasks that must edit the same files, or build on each other's output, run in
  sequence. A shared file has one owner at a time; a later task edits it only after the owner has merged.
- Fix every contract two tasks share (a list of names, a response shape, a constant mirrored in another language, a
  database CHECK) **in a committed file before either starts**, so every worktree branches from it. When several
  plans share one, write one reconciled contract; where it differs from a plan, the contract wins and says so.
- Tell a task that can start before its dependency merges exactly what it may build now and what waits for your
  message.

## Scheduling

- **Start every task whose inputs are ready, together.** Read the approved plan's task table as a dependency graph
  and launch its whole first layer at once. The rest start the moment the task they need merges, not when the program
  reaches them.
- **A gate blocks only what depends on it.** A probe, a decision or a test run that settles one task's question
  holds that task alone. Ask of each waiting task: which output does it actually need? Don't hold independent work
  behind a gate it doesn't read.
- **Run cheap work beside slow work.** Merge, review, write docs and brief the next worker while a suite, a build or
  a long run is going, within the limits of the machine you're on. Capacity differs per machine, so keep it per
  machine (a file keyed by hostname, with a cautious default for one not yet measured), and keep it apart from facts
  that hold on any machine; `references/this-repository.md` says where both live. Say which runs are going and what
  each one unblocks, so the user sees why nothing is idle.

## Choosing The Model

Default to Sonnet. Use Opus when any of these holds:
- **The worker must decide, not follow:** phase 1, an unfound root cause, a plan that leaves the design open, or an
  experiment it has to design.
- **A mistake would be quiet:** security, access, approval and data-boundary guards; anything that writes to a
  customer system or a database; anything where a missing check still passes the tests.
- **Other tasks build on it:** a shared contract, executor or migration that later tasks consume.

Run both at high effort; the review is the same depth either way. A Sonnet worker that meets a design question the
plan does not answer stops and reports; the orchestrator answers it or moves the task to Opus. A task that fails review
twice is re-run on Opus. To widen Sonnet's range, name bands of tasks that Sonnet takes **by default** until a
verdict (an optional experiment is never chosen): quiet-failure tasks, or a kind of work where the log shows Sonnet
holding as well as Opus. Give each the full checklist, follow each with a separate Sonnet verify pass before merge (or
name the review that stands in for one, such as the orchestrator's review of a plan), and tag its log row `experiment`
with its band (the log's README says how to read the result). `references/this-repository.md` holds this repository's
bands.

## Briefing A Worker

Write every brief from `references/brief-template.md`. It carries the fixed limits (own worktree, base check, no push,
no stash, checkpoint commits, how to test there, no whole-disk searches, no background process left running) and the
**current checklist**, pasted from the worker performance log's README, not linked. The worker does not see this
conversation, so the brief names every limit, every decision already taken, and what is held for the user.

## While Workers Run

- Report a running task as running and never predict its result. Take the next request, plan the next piece, or ask
  the user what to work on next.
- New information from the user, another worker, or a finished task goes to the worker it affects, as a follow-up to
  that same worker rather than a new one. If it invalidates the work, stop the worker and re-scope. Update the written
  plan either way, so it matches what is being built.
- A checklist line learned mid-day goes to the workers still running.
- Your own searches follow the workers' rules: no recursive search from the repository root that walks worktrees or
  dependency folders; list tracked files and search those.
- To pause every worker for a while, follow `skills/handoff-skill/SKILL.md`, *Pausing And Resuming*. To pause some of
  them, or to recover workers after a restart, follow *Pause, Resume And Restarts* below.

## Pause, Resume And Restarts

A worker can stop before it finishes in three ways: the user asks for a pause, you stop it, or the machine or app
restarts under it. Each one can leave it mid-command: a removal proof with the guard still deleted, a test run whose
output is lost, edits never committed. Plan for all three in the brief, and in each pause and resume message.

**In every brief** (the limits block in `references/this-repository.md` carries these):
- **The base line names a commit:** "reset to `<sha>` before any edit if you are not on it". A new worktree may start
  on the default branch rather than the working branch.
- **Long runs go in the background, logged to a file** under the worktree's `tmp/`: removal proofs, whole suites,
  anything over a few minutes. The worker reads the log rather than holding the run in its own turn, so a restart
  loses the run but not the result already written.
- **WIP checkpoint commits after each step of edits, and before starting anything long** (a suite, a typecheck, the
  removal proofs), even while tests are red. Mark them "(WIP)"; the worker may squash at the end. Waiting for green
  tests is too late: a worker that is mid-way has the most uncommitted work, and a dropped network or a restart
  ends its turn there (2026-10-23: an hour of route, UI and test work sat uncommitted through an outage because its
  tests were not green yet). A restart then costs the last step, not the task.

**To pause chosen workers:**
1. Send each one a pause message:
   - make sure no removal-proof mutation is left in any file;
   - stop any background run it started;
   - commit what it has as a WIP checkpoint, or say the tree is clean;
   - end its turn with one line on where it stopped;
   - start nothing new until told to resume.
2. A message to a worker that is mid-turn waits until that turn ends, which can be a long time. To pause it now, stop
   its turn after sending the message: the queued message runs next, so the worker pauses cleanly instead of being cut
   off (`docs/_learnings/a-message-to-a-busy-session-waits-for-its-turn-to-end.md`).
3. Never remove a paused worker's worktree. Tell the user which workers paused, and what each left: a commit, or a
   clean tree.

**To resume, or to recover after a restart,** message each worker. The message:
1. says what happened (a pause, a stop, a restart) and that the work in its worktree is intact;
2. asks it to check `git status` and `git log -1` against the expected base;
3. asks it to undo any removal-proof mutation left in place, checked against its own proof list, not from memory;
4. asks it to rerun anything whose output was lost before going on;
5. passes on what changed while it was paused: new commits on the working branch, the user's decisions.

A worker that went idle without reporting was probably cut off. Read the end of its transcript before assuming it
finished.

## Integrating A Finished Task

1. **Read the report and the diff critically.** Verify the claims that matter against `HEAD` (a worker can repeat a
   stale plan finding as fact). Check reuse of existing helpers against the plan's security findings. Act on problems
   the worker flagged in files it did not own.
2. **Send back or fix.** A defect inside the task's own scope goes back to the same worker. A small fix the worker
   could not make (outside its files, or a one-line correction) is faster done by you; say so in the commit.
3. **Merge** into the working branch (a fast-forward or a merge commit; never cherry-pick a worker's branch: the copy
   gets new commit ids, so the worker's branch diverges and its next base check fails). Resolve conflicts against the
   plan, then run the cross-cutting checks the worker could not see (`references/this-repository.md`): repository-wide
   suites can fail on a merge that every worker's focused tests passed. Merging while other workers still run is safe:
   each checks its base once, when it starts.
4. **Log it.** Add the task's row to the worker performance log (model, tokens, rounds, outcome, findings, and its
   cost read from the worker's transcript, not from the notification's token count). A finding that recurs becomes a
   checklist line, and cost and quality together decide where the model rule moves.
5. **Clean up.** First list the worktree's links (junctions or symlinks, usually a `node_modules` linked to the main
   checkout) and unlink each one: `rmdir` the link, never its contents. A forced worktree removal follows a link and
   deletes its target (`docs/_learnings/removing-a-worktree-follows-its-links-into-the-main-checkout.md`). Then copy
   any ignored evidence the worker left (`tmp/` logs, before-images) out of its worktree, then
   delete the worktree and branch. Keep a worktree only while its worker still has a phase to run. Stop any shell the
   worker left running.
6. **Carry** any failure a worker called pre-existing into the final report, after checking it on a clean `HEAD`.

## Moving A Fix To Another Branch

Sometimes a fix has to reach the pipeline branch before the feature branch it was found on is ready to ship.
- **Best: build the fix where it ships.** Branch it from the target, merge it there, then merge that same branch into
  the feature branch. The fix is one set of commits on both branches, with no duplicate. This works when the target
  is an ancestor of the feature branch (`git merge-base --is-ancestor <target> <feature>`); otherwise the merge would
  carry the target's newer commits into the feature branch, so cherry-pick the fix into the feature branch instead.
- **Already built on the feature branch: cherry-pick it, on purpose.** Cut a new branch from the target, run
  `git cherry-pick -x <commit>...` (the `-x` line records where each commit came from), and open the PR into the
  target. Then:
  - check that the fix stands without the feature: grep what it imports, calls or reads for anything that exists
    only on the feature branch (a migration, a view, a flag, a helper, an environment setting), and run the typecheck
    and the tests on the target branch, not only on the feature branch;
  - a fix that needs a migration the target's databases lack carries that migration with it, or it waits;
  - when the feature branch merges later, git usually sees the same change twice and merges cleanly; on a conflict,
    keep the target's version of the fix.
- **Keep fix commits apart from feature commits** so a fix can be picked whole: a commit that mixes the two cannot be.
- This is not how worker branches are integrated (step 3 above): those are merged.

## Tests

Workers run the focused tests for what they changed, plus the whole unit suite of each package they touched. The full
suite runs once, in the orchestrator, after everything is merged. Parallel full-suite runs multiply the most expensive
step and compete for the same machine. Stop any run you know the tree is about to invalidate rather than let it
finish.

## Closing

When the program ends: the full suite on the merged tree, the plan statuses updated, the report written with
`skills/handoff-skill/SKILL.md`, and every pending decision in the report's *Waiting on you* or in `tasks/`.

Then step back over the worker performance log, once per program:
- reread this program's rows and update the log README's *Patterns so far*;
- turn a finding that recurred into a checklist line, and retire a line whose finding has stopped recurring;
- give each `experiment` row a verdict (did the cheaper model hold up on that kind of task?), and say whether the
  model rule should change; it changes only on several clean experiments in the same kind of task;
- put a short *How the workers did* section in the report: tasks per model, outcomes, findings by category, tokens.

## Final Checklist

- Shared contracts committed before the workers that share them started?
- Every brief from the template, with the current checklist and each worker's model and reason?
- Every finished task reviewed, merged or sent back, logged, and its worktree cleaned up?
- Cross-cutting checks run after each merge, and the full suite once at the end?
- The worker log reviewed at the close: patterns, checklist and experiment verdicts updated, and summarised in the report?
- Nothing running that the user has not been told about?
