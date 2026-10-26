# A skill step the tools cannot do gets narrated as done

**Scope:** transferable
**Area:** every product skill under `workers/agent-harness/src/skills/`, and every tool description.
**Status:** open. It is a writing trap, not a code defect. `build-customization` and
`diagnose-problem` were written against it on 2026-09-28.

## The trap

A skill is prompt text, and the model reads each step as something it can do. When a step names
evidence Splotch does not hold, or a control no tool offers, the model does not stop and say so. It
satisfies the step in prose: it describes the evidence, or says the control was used.

- **2026-09-18.** The agent told a user that "the preview's fresh read confirms it is currently OFF".
  The config preview read nothing live at the time; the description implied it did.
  `test_instruction_consistency.py::test_netsuite_config_preview_says_where_current_state_comes_from`
  now pins the field that is the only permitted source of a current-state claim.
- **2026-09-28, caught in review.** The first draft of the diagnose playbook asked the agent to use
  "execution logs, deployment logs, status logs and performance logs", and to show "only the scripts,
  workflows and forms" on the map. Splotch ingests no script execution logs, no APM data and no System
  Notes. `open_panel` and `splotch:map` links take a focus and a NetSuite feature, nothing else. As
  drafted, the step would have produced invented log findings and a false "I filtered the map".

- **2026-09-28, in a live workstream: the tool existed but failed.** The build playbook's Path A
  step was `create_process_splotch`. In `chats/suitescript2.0_migration2.md` it returned Next's HTML
  404 four times (the harness was newer than the app; see
  [an-agent-newer-than-its-app-improvises-around-the-gap](./an-agent-newer-than-its-app-improvises-around-the-gap.md)).
  The agent relabelled the job Path B, drew nothing, and told the user *"I drew the as-is directly
  from the ingested source"*. It then marked the three drawing todos, a verification the user had
  declined and a comparison it never captured as **complete**, because a todo had no other way to
  close. Two remedies, 2026-09-29 (`plans/workstream-actions/agent-build-trace-fixes-plan.md`, D4 and
  D8): `build-customization` now says to **stop and ask** when a Path A tool fails or is missing, and
  never to relabel the work; and a todo can be **`skipped`**, which closes its stage like `complete`
  but is drawn struck and labelled, with the reason said in chat. Both are pinned in
  `test_workstream_playbooks.py`.

## Why it is easy to miss

The draft reads as correct because the words describe what a consultant would do. Nothing fails when
the skill loads, and no test notices. The first sign is a confident answer resting on nothing, which
reads exactly like a good answer.

## The check

Before a step ships, name the tool call or the response field that performs it:

- **evidence**: the endpoint and the field (`via.operations`, `lifecycle`, `result.criticalPromotion`,
  `blastRadius.feature.stateSource`);
- **display**: the `open_panel` argument or the link form, as its schema defines it;
- **action**: the tool, and the gate it passes.

If nothing performs it, the step says what Splotch lacks and what to ask the user for instead. The
missing capability goes into the feature's `future-improvements.md`.

And when the tool exists, say what the step does **if it fails**. A skill that offers two paths reads
a failure on one as permission to take the other; a todo with only "done" to close it gets ticked. Then pin that limit sentence in a
test (`workers/agent-harness/tests/unit/test_workstream_playbooks.py` does this), so an edit that
quietly "restores" the capability fails.

**2026-10-08, APM.** APM is still not ingested. It can now be read in the live browser through
`netsuite-performance-metrics`, which is written against this trap:

- The digest of interactive elements never holds a metric, and the selection echo is capped at
  512 characters. So a number is reported only from `Selected text` after a `triple_click`, and a
  figure read off the screenshot carries **(approx., read from screen)**.
- Two steps stay out of the skill because no tool performs them: reading a chart, and exporting a
  CSV (no tool captures a download). Both are listed in
  `docs/netsuite-performance-metrics/future-improvements.md`.
- `test_performance_metrics_skill.py` pins these limits.
