# A rule moved to a reference to fit a budget stops being read

**Scope:** transferable
**Area:** any progressive-disclosure instruction set: here, `workers/agent-harness/src/skills/product-skills/*/SKILL.md`
and their `references/`, held to ~5,000 tokens by `tests/unit/test_skill_spec_conformance.py`.
**Status:** mitigated 2026-10-14: the rule for what may move is written (`workers/agent-harness/docs/architecture/06-skills.md`,
*Keeping SKILL.md inside its budget*), a declared buffer of up to 10% exists for decision-time rules, and the
2026-10-14 audit put 22 of the 30 findings back in reach. The budget test still cannot tell a rule from reference
material, so a move can strand one again.

## The symptom

- The SI test run (2026-10-13) answered SuiteApp setup questions with "not collected" while `suiteAppSetupV1` held
  106 KB of setup values: the projection and the rule for reading it ("a `status` other than `read` means not read,
  never 'not set up'") lived only in a reference no run opened (inventory I-08).
- A skills pass trimmed `netsuite-script-generation` to 4,981 of 5,000 tokens by moving "a package spanning several
  processes deploys one process at a time" into `references/api.md`, whose pointer fires "in Mode B": a run can reach
  the multi-process deploy without reading it.

## Why it was misleading

The move looks lossless: the text is still in the repository, every test that pins it still passes (it reads the
reference file), the budget test goes green, and a reviewer reading the skill folder sees the rule. Nothing records
that the agent reads `SKILL.md` whole but a reference only when it decides to (`skills_middleware/prompt.py`: "load
those only when relevant").

## Why it happens

A size budget pushes text out of the always-read file, and the cheapest text to move is whatever is self-contained,
which is often a rule. A pointer like "read `api.md` in Mode B" or "see `x.md` for the full rules" names a moment that
is not the moment the rule governs. The 2026-10-14 audit of all 65 product-skill references found about 595 decision
sentences: 11 findings sat in a reference with no pointer at their decision and 19 behind a pointer that fired
late or loosely (a blank workstream's limits behind "before you plan
one", read only once planning starts; an integration role's "never `FULL`" behind a step-5 pointer, after the table
was approved at step 3; change-history rules behind "before filtering" while the same fields arrive on every focus
reply).

## What to do

- Before moving text out of a size-budgeted instruction file, sort it: field shapes, endpoint parameters, examples
  and long procedures move; refusals, stops, never/always rules, one-at-a-time rules and completion criteria stay.
- A pointer names the decision: "Before <the decision>, read `references/x.md`", placed where that decision is made.
  "See", "for detail" and a trigger on a different step do not count.
- When a test pins a moved rule, check what file it reads: a pin on the reference proves the text exists, not that
  the agent reaches it. Pin the pointer in the always-read file too.
- When the rules alone outgrow the budget, use a declared allowance with its evidence, and split the skill if it
  keeps growing; never trim a rule to fit.

## Updated 2026-10-19: a pointer to another skill is weaker on a cheaper model

The output-format offer (SPL-4605) first sat at each hand-over as one line pointing to the
`output-formats` skill. Muse Spark followed it, read the skill and asked the right card. GLM 5.3 Flash,
the model light runs are routed to, never opened the skill and ended without asking. Writing the
instruction itself at the hand-over (the question, header, label shape and the "never PDF" rule) and
leaving only the option table in the skill took GLM from 0 of 1 runs to 2 of 3. With routing, the
same text is read by models of different strength: check a pointer on the weakest model it is sent to.
