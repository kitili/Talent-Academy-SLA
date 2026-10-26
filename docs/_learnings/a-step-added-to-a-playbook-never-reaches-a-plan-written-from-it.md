# A step added to a playbook never reaches a plan written from it

**Scope:** transferable
**Area:** any instruction template that seeds a stored plan: here the workstream playbooks' stage tables
(`workers/agent-harness/src/skills/product-skills/*/SKILL.md`) and the plan a workstream stores (`splotch_agent_chats.plan`).
**Status:** designed out for the Scope it question on 2026-10-24 (plan 17, Amendment 1) for two playbooks, and on
2026-10-26 (Amendment 2) for eight: the step's own reference now adds a missing todo before it acts, in any playbook that
carries the question. Open for any other step added to a playbook. The nested-playbook form (below) is designed out for
the same question by rule 1 of the reference.

## The symptom

A new todo, *Show the action plan*, was added to the build playbook's Scope it row and pinned by tests. The same day a
build workstream on the demo project ended Scope it **complete with three todos**, no action-plan todo and no report; the
user was never asked, and the progress bar showed nothing for it (PROD row read SELECT-only, 2026-10-24; plan 17,
Amendment 1, *Live data*).

## Why it was misleading

The playbook table was right, its pins were green, and a text already said what to do when a stop is missing. That text
(`moving-from-analysis-to-change.md`, step 2) fires only when an analysis turns into a change, and the playbook itself says
of a planned workstream only "say if a stop below is missing". A workstream that starts as a build never meets either.

## Why it happens

The table is copied once, when the plan is written: by the agent for a blank workstream ("take its stages and todos as
the plan, fitting the todo titles to the work"; "take only the stages the work needs"), by Gate 2, or by an older harness.
A stored plan does not change when the template does, and a model fitting stages to the work may leave a todo out. The
agent then follows the stored todos, so a step that is not a todo is not done. Whether the run above had the new text is
not known (the transcript is not on the row); either way, nothing would have put the todo back.

## What to do

- When you add a step to a template that seeds stored plans, make the step's own instruction check for its todo and add
  it (here: a plan `PATCH`, ids unchanged) before it acts, in any planned workstream, not only on one path into it.
- Decide what happens to plans already past that step: do not reopen a finished stage (it changes the bar's state); put a
  late request in the stage in progress.
- Accept a new step from the stored plan, not from the template: read the plan row after a real run.

## The same gap, one layer out (2026-10-26)

The question was then added to two playbooks and not to the others. On 2026-10-26 a "Netherlands subsidiary setup" ran on
`netsuite-org-structure-change`, one of six playbooks that change an account and had no such step, and the user was never
asked (plan 17, Amendment 2, *Why*). A rule added to some playbooks does not exist in the rest: the model does what the
playbook it read says. The fix was the same pattern, eight times: each playbook's stage row ends with the two todos and
one step points at the shared reference (`build-customization/references/the-action-plan-in-scope-it.md`), whose opening
adds a missing todo by a plan `PATCH` before it asks. The fix is merged on `feat/action-plan`, not deployed, and no run
has yet read a plan row to confirm it (acceptance, plan 17 Amendment 2).

## A nested playbook asks the same question twice

Four of the six hand their change to `build-customization` (`netsuite-access-change`, `netsuite-integration-setup`,
`netsuite-reporting-change` and each wave of `assess-and-remediate`), and `netsuite-org-structure-change` hands a
feature switch to `netsuite-config-change`. Both of those end their own scoping stage with the same
question, so a workstream asked in the first playbook would be asked again in the second for one change, and the second
answer could contradict the first. Adding the step to every playbook creates this; it is not a bug in any one of them.

- **Rule 1 of the reference:** read the plan first; if another stage already holds *Show the technical report* or *Show the
  action plan* as `complete` or `skipped`, the question was answered there: do not ask, and do not add the todos to this
  stage. The plan's todo states are the record of what was asked, so nothing new is stored and the sub-playbook need not
  know its caller.
- **What to do** when a step is added to several templates that can call one another: decide where the record of "already
  done" lives (here the stored plan) and make each template read it before it acts. Pinned in
  `test_action_plan_in_scope_it.py`; whether a model reads the plan before asking is an acceptance check, not a unit test.
