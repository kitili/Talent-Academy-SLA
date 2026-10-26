# Standard Feature Work Methodology

Use this flow for feature work, fixes, documentation, and tests. Keep every change grounded in behavior the application actually uses.

1. **Study First**
    - Read `docs/_learnings` before starting. It records pitfalls, banana skins, and gotchas found the hard way; skim the index for anything touching your area (`skills/learnings-skill/SKILL.md` explains how entries are written and read).
    - For existing features, read the relevant `docs/<feature>` folder before changing code.
    - For database schema details, read `shared/schema.ts` (Drizzle) and the SQL in `supabase/migrations/` before making assumptions about tables, columns, relationships, or constraints. Some tables are created at server start in `server/db.ts` and some were added by hand, so the schema file is not the whole picture. There are no schema snapshots yet; the live Neon database is the truth.
    - For a migration, a backfill or repair, or any SQL someone runs by hand, follow `skills/migrations-skill/SKILL.md` and its `references/this-repository.md`.
    - Trace the real implementation paths: routes, components, services, hooks, utilities, workers, storage, database contracts, and permissions.
    - Assume a rule you find is not the only place that rule lives. The same invariant is often enforced again in an Express route under `server/`, in a second React layer under `client/src/`, or in SQL under `supabase/migrations/`, over a different source of truth. Before calling a rule fixed, grep for it outside the file and language you changed.
    - Separate current shipped behavior from future plans, assumptions, and desired behavior.

2. **Confirm Scope**
    - Keep independent features documented and tested independently, even when they share UI or infrastructure.
    - For new features without an obvious documentation home, confirm with the user before creating one:
        - "This looks like a new function that is not yet covered in our documentation. I propose we create a new cluster/folder called `X` and document it there. Do you agree or would you say otherwise?"
    - Call out security, access-control, data-boundary, or environment-boundary risks before or while fixing them.

3. **Plan the Work**
    - Follow `skills/plan-skill/SKILL.md` for how to write a plan: its status lifecycle, the simplest design and what was cut, task boundaries and the test plan.
    - For non-trivial work, create a concise plan that includes both the functional/logical plan and the test plan.
    - Decide which behavior will be implemented now and which ideas belong in `future-improvements.md`.
    - Prefer shared utilities only when they reduce real duplication in app-used code.

4. **Delegate and Orchestrate**
    - When your environment supports subagents and separate worktrees, the thread the user talks to can run as an orchestrator: it plans, talks with the user, delegates approved work to workers and integrates their results. Follow `skills/orchestration-skill/SKILL.md`, its brief template and its `references/this-repository.md`. Without that support, do the same plan sequentially.
    - **Choose the worker mode when delegated work starts, and tell the user which one you are using.** *Independent sessions* (each worker its own session, in its own worktree) keep running when the orchestrator is stopped, but each keeps its own permissions and approvals, and messages between sessions can wait on the user, so they suit a user who is around to answer. *Background subagents* (workers inside the orchestrator's process, run in the background) stop when the orchestrator is stopped, but run under the orchestrator's own permission mode and never wait on the user, so they suit a user who leaves the orchestrator in charge and reviews at the end. Use background subagents when the user says they will be away or leaves you in charge, and independent sessions otherwise, unless the user names one.
    - A worker may diagnose and plan (phase 1); it commits the plan to its own branch and stops. Implementation (phase 2) starts only after the user signs off, and goes back to the same worker. A worker never moves on to phase 2 by itself.
    - Each task runs in its own worktree under `.claude/worktrees/`, branched from the working branch's current `HEAD`, never in the main checkout. A worker stays inside the files it owns, commits to its own branch, and never pushes, stashes, or switches another checkout's branch. Its brief names these limits, because it does not see this conversation.
    - Draw task boundaries by file ownership: tasks that edit the same files, or build on each other's output, run in sequence. Fix any contract two tasks share in a committed file before either starts.
    - Choose each worker's model by what a mistake would cost: Opus when the worker must decide, a mistake would be quiet, or other tasks build on it; Sonnet otherwise. A task in one of the Sonnet bands of `skills/orchestration-skill/references/this-repository.md` (read-path access gates, permission wiring through an existing resolver, UI gating the server also enforces, a large UI over a contract the server computes, migrations written but not applied, skill and tool text) goes to Sonnet by default, always followed by a separate Sonnet verify pass before merge; so do phase-1 plans and read-only probes, which the orchestrator's review checks instead. Account, connection or credential choice, write executors, data repairs, shared contracts and any plan that fixes one stay with Opus.
    - Workers run the focused tests for what they changed. The full suite runs once, in the orchestrator, after everything is merged.
    - The orchestrator owns integration: it reviews every diff and report, merges, adds the task's row to `docs/_global/worker-performance/log.jsonl`, and removes the worker's worktree and branch.

5. **Implement Real Behavior**
    - Implement against code paths that the application imports or executes.
    - Do not create test-only helpers, unused policy helpers, or mock behavior that gets ahead of the app unless the implementation is also being wired in.
    - Keep edits scoped, preserve unrelated work, and avoid unrelated refactors.
    - Prefer application feature flags, operational switches, enums, and finite mode selections in a constants module under `shared/` (none yet; create `shared/constants.ts` for the first one) so they remain code-controlled and reviewable.
    - Keep secrets and security-sensitive variables in environment configuration. Promote a non-secret constant to an environment variable only for a strong, documented deployment-specific reason; convenience alone is not sufficient.
    - Put debug logging behind an explicit flag or remove it before closing the task.

6. **Test the Feature**
    - Follow `skills/test-skill/SKILL.md` and its `references/this-repository.md` for how to design and run tests.
    - Add new tests under `tests/unit/` or `tests/integration/` (`node:test`). The older tests directly under `tests/` also run in `npm test`. Tests must exercise code the app runs (functions, routes, components, workers, contracts), never test-only helpers. Move orphan tests into the correct home when touching a feature.
    - Run the focused tests and `npm run typecheck`. If verification cannot run, say why.
    - Before closing, run `npm run test:needed`: if the last green run still covers the tree, skip the suite; if only docs, skills or the rules files changed, run `npm run test:docs`; if the last full run failed and the fix changed only the failing test files, run `npm run test:failed`; otherwise run the full `npm test`.

7. **Document the Result**
    - Follow `skills/documentation-skill/SKILL.md` and its `references/this-repository.md` for where documentation lives and what each file holds.
    - Update `docs/<feature>` after implementation, or create it only after confirming a new documentation home.
    - Include current behavior, architecture or operations notes, relevant files, future improvements, and `test-suite.md` when applicable.
    - Clearly label future or unimplemented behavior so it is never confused with shipped functionality.
    - Keep file maps honest: include only files relevant to the feature and note boundaries with adjacent features.
    - Add a `docs/_learnings` entry when the work turned up a pitfall, banana skin, or gotcha that would catch someone competent again, and link it from that folder's index. Update or correct an existing entry rather than duplicating it; when a trap is designed out, say so in the entry instead of deleting it. Follow `skills/learnings-skill/SKILL.md`.

8. **Close the Loop**
    - Summarize what changed, which tests/docs were updated, and which verification commands passed.
    - Mention residual risk, skipped verification, or follow-up work only when it matters.

# Standard Working Paradigms

1. **Prefer simplicity, always.** It keeps the code maintainable: use the smallest design that meets the requirement, and give any new table, service, queue, flag, abstraction or dependency a one-line justification or cut it. It holds at every step, not only in planning; a plan records what was cut (step 3).

2. **Never commit with Claude or Codex as the co-author** Each steering engineer owns the work because they are accountable and responsible for the work done by you and the workers.

3. **Keep track of unfinished work/threads** Show the user what is still to-do or pending in a `Waiting on you` section unless that task is already in `tasks/prioritised/` or `tasks/unprioritised/` (one file per task, indexed in `tasks/README.md`). When a task or decision is deferred, add its file to `tasks/unprioritised/` and an index row under its family, as `tasks/README.md` describes; when it is done or dropped, delete the file and its row and say so in the commit message.
