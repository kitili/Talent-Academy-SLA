---
name: handoff-skill
description: Use when an orchestrator (the thread the user talks to, which plans, delegates to workers and integrates their results) hands its work to another orchestrator — at the end of a long session, before context runs out, when the user asks for a handoff, or when a new orchestrator picks one up — and when the user asks to pause all workers for a while and resume them later. Covers what to verify before writing, what the handoff document must contain (repository state, every worktree and branch, every worker and what it was doing, decisions waiting on the user, operations paused mid-way, what shipped, loose ends), how to write it so a reader with no memory of the session can act on it, and how the receiving orchestrator takes over safely. The core method is portable; references/this-repository.md says where handoffs live in this repository and the commands that gather the state.
---

# Handoff Skill

## Purpose

An orchestrator holds a lot of state that lives nowhere else: which workers exist and what each was told, which branches are plans and which are builds, what the user decided in passing, what is paused and why. When the session ends, all of that is lost unless it is written down. A handoff is that written state: a single document that lets a new orchestrator, with no memory of the session, take over without asking the user to repeat themselves and without redoing or undoing anything.

**This file is the portable core.** For where handoffs live here, the commands that gather the state, and this repository's specific traps, read `references/this-repository.md`.

Running workers day to day (briefs, boundaries, review, merge, the worker log) is `skills/orchestration-skill/SKILL.md`; this skill starts where that work is handed over, paused, or reported.

## When To Write One

- The user asks for a handoff.
- The session is long and context is running low: write it before the summary loses detail, not after.
- You are about to stop with work in flight: running or paused workers, unmerged branches, pending decisions, half-applied operations.

A handoff is not a progress report to the user. The user reads the conversation; the handoff is for the next orchestrator.

## Before Writing: Verify, Don't Recall

Everything in a handoff must be checked against the live state at the time of writing. Memory of the session is the least reliable source — it is what the summary compressed.

1. **Repository state.** Current branch and HEAD, whether it is pushed (`origin/<branch>` == HEAD), uncommitted files and whose they are. Other sessions may have committed on the same branch; name their commits so the next orchestrator does not mistake them for yours.
2. **Every worktree and branch you created**, with its HEAD, and whether it is merged into the working branch. A worktree you cannot remove (locked by a dead process) is a loose end; give the command that removes it.
3. **Every worker.** Running, finished, or stopped. A running worker must be finished, stopped, or explicitly handed over — never left running unmentioned. Say plainly that worker ids are usually tied to the session that spawned them: the next orchestrator may not be able to message them, so describe each task well enough to restart it from the written plan.
4. **Every operation paused mid-way** (a backfill, a migration, a dry run across accounts): where it stopped, what was applied and where, where its log and before-images are, and the exact command to resume.
5. **Every decision the user has not answered**, with your recommendation, and every decision the user has answered that is not yet written into a plan or doc.
6. **What was verified and how:** test runs (counts, pass/fail), and anything claimed but not checked. Do not upgrade "the worker said" to "verified".

If a fact cannot be checked, write it as unverified, with the reason.

## What The Document Contains

In this order, so the most urgent things come first:

1. **Where things stand, in one paragraph.** Branch, HEAD, pushed or not, whether anything is running, what is deployed and what is not.
2. **Who and how.** Who the user is and what they approve; the rules the session relied on (pointing to the rules files and skills rather than copying them), and any rule the user added mid-session that a reader might not yet have in context. The traps that bit this session.
3. **Worktrees and branches**, as a table: path, branch, HEAD, state (plan only / built and unmerged / merged), next step.
4. **Decisions waiting on the user**, grouped by topic, each with: the finding in two or three lines, the options, the recommendation, and the plan file that holds the detail. This section doubles as the user's "Waiting on you" list.
5. **Paused operations**, each with what was done, what remains, the log path and the resume command.
6. **Workers used in the session**, as a table: id, task, how it ended (merged at which commit / plan only / paused / done). For a worker the next orchestrator will relaunch rather than resume (stopped before it wrote anything, or interrupted), commit its brief with the handoff, in an appendix or beside the plan. A brief left only in the session's transcript is lost with the session, and the next orchestrator has to rebuild it from memory.
7. **What shipped**, grouped by area, with commit hashes and one line each. Say what is merged, what is pushed, and what is deployed — these are three different states.
8. **Loose ends**: small things offered and not answered, cleanups the user was asked to do, things to check after a deploy.

Link plan files and logs by path; do not paste them. A handoff that copies plans goes stale the moment a plan changes.

## How To Write It

- Write for a reader with no memory of the session. Spell out ids, paths, account numbers and commit hashes; never "the demo project" without saying which one.
- Separate facts from recommendations, and recommendations from decisions the user made. Mark each decision with who made it and when.
- Prefer tables for state (worktrees, workers, decisions) and short paragraphs for reasoning.
- Name the dangers concretely: a flag that charges real money once merged to main, a step that must not be re-run, an operation the user paused on purpose.
- Keep it current, not complete: the session's history lives in git and the plans. The handoff says what is true now and what to do next.
- Date the file and the state ("as of HEAD `abc1234`, 2026-10-05 18:22").

## After Writing

- Commit the handoff only if the user wants it in git; otherwise say where it is. Never commit secrets, customer data or anything from gitignored evidence folders into it.
- Tell the user where it is and what the next orchestrator should do first.
- Do not start new work after writing the handoff unless the user asks; anything started afterwards is missing from it.

## Taking Over (The Receiving Orchestrator)

1. Read the handoff, then the rules files, then the learnings index — in that order.
2. Re-verify the state the handoff describes before acting on it: `git status`, the branch and HEAD, the worktree list. If it has moved, find out why (another session may have committed) before touching anything.
3. Do not resume a paused operation or apply anything the handoff marks as awaiting the user's approval. Ask first.
4. Restart work from the written plans, not from the old workers: brief a fresh worker with the plan path, the branch and the rules. Have it check its base against the working branch.
5. Clean up the loose ends the handoff names (stale worktrees, merged branches) once you have confirmed they are what it says.
6. When your own session ends, write the next handoff — update the previous one only if the user prefers a single living file.

## Pausing And Resuming (A Short Handoff To Yourself)

The user may need the machine back for a while (a presentation, a call) and ask you to pause everything. A pause is a handoff to your own future turn: the same orchestrator resumes, with the same workers, so the note can be short. It still has to be written, because the stop itself loses things.

**To pause, in this order:**

1. **Stop the full-suite run first.** A run interrupted part-way gives no result, and you'll re-run it on resume anyway. Stopping the task can leave the test processes running; check for them and end them.
2. **Stop each running worker.** Stopping keeps its context, and the same worker resumes when you message it, provided its worktree still exists. Never remove a paused worker's worktree: removing a worktree also deletes its ignored files, including evidence and before-images.
3. **Stop the shells the workers left.** A worker's background commands (wait loops, searches) outlive it. List them by the worker's worktree path or scratch files, and stop them.
4. **Record what is still live outside the machine.** This is the part that can do harm. A paused worker may have stopped mid-way through a write to an external system: a probe object deployed and scheduled in a customer or demo account, a half-applied backfill, a queued job. Read the worker's evidence folder and logs, and write down each live object: its ids, its state at the last check, and how to finish or undo it, including any step only a person can do.
5. **Back up uncommitted worker output** (a plan draft, say) to the main checkout's ignored scratch folder, in case the worktree is lost.
6. **Write the resume note** in the main checkout's ignored scratch folder (`tmp/paused-<date>.md` here). It covers:
   - the working branch, HEAD, and what isn't pushed;
   - the last green run;
   - each worker: its worktree, branch, what was done, where it stopped, and the message that resumes it (for a worker that may have to be relaunched instead, its whole brief);
   - the live outside state from step 4;
   - the resume steps in order.
7. **Confirm the machine is idle,** with no test, worker or search processes left, and tell the user what is paused and what is still live outside the machine.

**To resume, in reverse:**

1. Re-read the resume note, and re-check the branch: another session may have pushed in the meantime.
2. Re-run the full suite, then push.
3. Resume each worker with a message saying what changed while it was paused (new commits on the working branch, decisions the user made), and what to do first. That is usually the live outside state from step 4: check it, record the result, clean it up.
4. Delete the resume note once everything it lists is resumed or closed.

## Final Checklist

- Is every fact in it checked against the live state, or marked unverified?
- Does it list every worktree and branch you created, with HEAD and state, and every worker with how it ended?
- Is anything still running? If so, is it stopped or explicitly handed over?
- Does every paused operation have its log path and resume command, and does every approval-gated step say it is waiting on the user?
- Does every pending decision carry a recommendation and a link to its plan?
- Are merged, pushed and deployed kept apart?
- Could someone who never saw this session act on it without asking the user to repeat anything?
