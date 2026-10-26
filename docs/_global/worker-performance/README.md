# Worker Performance Log

How each delegated worker did, by model, so delegation can get cheaper without getting worse. The question it answers:
**which tasks can the cheaper model take, and what does its brief need so it can take more?**

[`log.jsonl`](log.jsonl) holds one row per finished worker task. The orchestrator adds the row when it integrates the
task (`skills/orchestration-skill/SKILL.md`, *Integrating A Finished Task*), from the task notification's usage figures
and its own review. Rows are never edited after the fact except to correct a wrong figure.

Nothing here trains a model. What we can change is the **brief** (the checklist below), the **model choice** (the
rule in `skills/orchestration-skill/SKILL.md`, *Choosing The Model*) and the **review**. The log says which to change.

## A row

| Field | Meaning |
|---|---|
| `date` | Day the task was integrated (state the time zone once, here) |
| `program`, `task` | The plan or program, and the task's name in it |
| `model`, `effort` | The model id the worker ran on; `high` unless stated |
| `kind` | `probe` (read-only investigation), `plan` (phase 1), `build`, `fix` |
| `ruleTests` | Which of the model rule's three tests the task met: `decide`, `quiet`, `foundation`. Empty means a cheaper-model task by the rule |
| `tokens`, `toolUses`, `minutes` | From the task notification; cumulative over every round of the same worker |
| `rounds` | Times the worker ran: 1, plus one per send-back |
| `outcome` | `merged-clean`, `merged-with-orchestrator-fix`, `sent-back-then-merged`, `rerun-on-stronger-model`, `abandoned` |
| `baseReset` | The worktree started on the wrong base and the worker reset it (the brief asks it to) |
| `findings` | Defects the review found: `{ severity, category, summary }`. Not design notes |
| `notes` | What went well, self-reported gaps, files edited outside its list (and whether it said so) |

**Severity:** `high` means it would have shipped a security, data-boundary or wrong-data defect. `medium` means wrong
behaviour or wrong text a user or agent would act on. `low` means incomplete, but said so.

**Categories** (add one only when a finding fits none):
- `boundary-pattern-copied`: reused an existing helper or pattern that carries a known boundary trap.
- `stale-claim`: wrote as fact something a plan or doc said that the code at `HEAD` no longer does.
- `contract-deviation`: departed from a shared contract without stopping to ask.
- `scope-overrun-unreported`: edited files outside its list and did not say so (reported overruns go in `notes`).
- `missing-guard-test`: a guard with no test that fails when it is removed.
- `false-done`: reported something done or passing that was not.
- `narrow-verification`: ran only the tests next to its change and missed a repo-wide check its change broke.
- `left-undone-reported`: left part of the task undone, and said so.
- `missed-hazard`: loosened or built something without handling a hazard the change creates.
- `fail-open`: a check that allows the action when its input is missing or unset (e.g. an environment variable).
- `incomplete`: found part of the answer and said what it could not verify.
- `scope`: edited outside its brief, said so, and kept it separable.

## Reading it

**When:** a row at every integration; a step back once per program, at its close (`skills/orchestration-skill/SKILL.md`,
*Closing*), with a *How the workers did* section in that program's report.

- Failure rate and severity per model, per `kind`, and per `ruleTests`: do the cheaper model's `high` findings cluster
  on tasks the rule would give the stronger one?
- Tokens and minutes per task per model. Do not quote prices from memory.
- Categories that recur for one model become a line in the checklist below. A category that stops recurring after its
  line was added is evidence the brief works.
- **To widen the cheaper model's range,** give it a task the rule would give the stronger one, with the checklist in
  the brief, and mark the row's `notes` with `experiment`. Relax the rule only on several clean experiments in that
  kind of task, never on one.

## Brief checklist, from the log

Paste into every worker brief, whichever the model. When a line is added, name the rows it came from.

1. **Re-check every claim a plan or doc makes against the code at `HEAD` before you act on it or write it down.**
   Plans go stale within a day.
2. **An existing helper is not a safe helper.** Before reusing a resolver, picker or context builder, read the plan's
   security findings and check the helper against them; say in your report which existing helpers you reused.
3. **Before you report, run the whole unit suite of every package you touched**, not only the files next to your
   change: repo-wide checks live elsewhere.
4. **Apply every clause of the shared contract everywhere it reaches, and never change today's behaviour for users
   while the feature ships off.** List in your report which contract clauses you applied, and to which paths. If the
   plan would alter what users get now (a step that becomes manual, a default that flips), stop and report it as a
   decision instead of shipping it.
5. **When you change what is allowed, find every reader of the old rule** (skills, prompts, docs, UI text, and any
   list a skill gates on) and change them in the same commit, or name them in your report. A loosening the agent
   cannot reach, or describes wrongly, is not done.
6. **Never shorten existing guidance to fit a size limit.** Move it to a reference file the skill links, or stop and
   report the limit.
7. **A test you cannot run is a guess: write it to work where it runs, and say it was not run.** In a browser fixture,
   reach each state through what the fixture route serves (open it by URL; never follow a link into a real app route
   the fixture does not serve). Before writing tests with a tool, read the project's learnings for it. Prove each
   guard by removal.
8. **Assume you can be cut off at any moment.**
   - Run removal proofs and suites in the background, logging to a file.
   - Commit a WIP checkpoint after each step of edits and before starting anything long (a suite, a typecheck,
     the proofs), even while tests are red. Waiting for green tests is too late.
   - When told you were interrupted, check that every proof mutation is restored before anything else.
9. **Call a failure pre-existing only after it fails the same way in a checkout that has the gitignored fixtures**
   (the main checkout), or say you could not check. A fresh worktree lacks them.
10. **Leave no link behind.** Prefer the main checkout's tools by absolute path. If you linked anything into your worktree
   (a `node_modules` junction), remove the link as your last step after your tests and say so: a forced worktree
   removal follows a link and deletes its target.
11. **When skill text tells the model what to do in a case, read what the tool itself says in that case** (its
   next-step line, its warnings, its refusals) and make the two agree, or say in the text which one wins. The model
   reads both, and a tool message that says the opposite wins as often as the skill does.
12. **Before you report, list what your guards do not cover, and check each one by reading:** a sentence another file
   contradicts, a field or contract another task also writes, a reader of a rule you changed, a renderer key that
   changes, an export with no production caller. Say in your report what you checked this way. A guard proven by
   removal covers what it tests and nothing beside it.

## Patterns so far

None yet. Write the step back here at each program's close.
