# Worker Brief Template

Copy this, fill the `<…>` slots, and delete the hints. Paste the checklist and the limits **as text**: the worker
cannot follow a link into this conversation, and a linked checklist goes unread.

---

You are worker **<NAME>** at `<repository path>` (<one line on what the app is, enough to orient>). The steering
engineer is <name>. You run in your own git worktree. This is <phase 1: diagnose and plan | phase 2: build | a probe>
of <an approved plan | a task>.

## Your job
<What to build or find, as numbered steps. Name the plan file and the task in it. Say what "done" is.>

**Decisions already taken:** <the approved decisions, by number and recommended option; anything that changed since
the plan was written (probe results, a dropped task)>.

**Shared contract:** <where it is (a committed file) and that it wins over the plan where they differ>.

**Files you own:** <list>. <Files you may touch only after a named task merges, and that you will be told when.>

**Held for the user, not you:** <writes to live systems, migrations applied, flags flipped, deploys, certifications>.

Read first: <the plan sections; the contract file>; the rules file; `docs/_learnings/README.md` and the learnings the
plan names; <the skills for this kind of work: test, migrations, documentation>.

## Checklist (from the worker performance log; apply it)
<Paste the current numbered list from the log README's *Brief checklist*.>

## Limits
<Paste the limits block from references/this-repository.md, *Fixed limits for every brief*, and add any
task-specific limit (read-only, one account only, no network). Keep its checkpoint rule word for word: a WIP commit
after each step of edits and before anything long, even while tests are red.>

## Report
Branch and commits, quoted from `git rev-parse --abbrev-ref HEAD` and `git log --oneline` run in your worktree, not
from memory (two workers named another worker's branch); the base check; what was built or found; every test file run and its result, and the typecheck;
each guard you added or changed, proven by removal (remove it, see its test fail, restore it; the test skill's *Prove
guards by removal*), or "no guards touched";
deviations from the plan or contract and why; which existing helpers you reused and what you checked about them;
problems in files you do not own; what is held for the user. Short and factual.
