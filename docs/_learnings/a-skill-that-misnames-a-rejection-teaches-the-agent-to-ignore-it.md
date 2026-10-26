# A skill that misnames a rejection teaches the agent to ignore it

**Scope:** transferable
**Area:** agent skill text that explains a failure: here `netsuite-connection-setup/SKILL.md`, the
NetSuite integration form's Save.
**Status:** fixed in the skill text on 2026-10-04 (`plans/project-onboarding/bundle-install-struggle-plan.md`).
The harness deploy carrying it is pending.

## The symptom

An onboarding run (2026-09-02) spent 24 minutes and 54 browser actions on one NetSuite form. Its own
narration, in order:

> The bottom Save swallowed the click — the page didn't navigate.

> The earlier error banner was stale from initial page load.

> Now there are stacked errors … These bottom-Save clicks *were* registering as submits after all.

It made about eight Saves over three rounds before acting on a banner.

## Why it was misleading

The skill said, three times, that "the bottom Save frequently swallows clicks", and offered a
remedy: use the top Save. So "the page did not change" had a ready explanation that needed no
further look, and the agent applied the remedy instead of looking. Each banner it did see it
called stale, because a swallowed click cannot produce a fresh one. The rule was written from a
real observation (the visible part of the form did not change), but it named the wrong cause.

## Why it happens

- NetSuite redraws a rejected form with its error banner at the **top**, out of view when the Save
  button is at the bottom, so a rejection looks like nothing happened.
- Every rejection **stacks another banner** and pushes the form down. The checkbox positions the
  agent had worked out were wrong after each Save. That is why it kept ticking the box beside the
  one it meant (positions drifted 263 → 281 → 297 → 417 → 510 → 603 px across the run).
- A skill sentence that explains a symptom is read as the diagnosis. The agent does not
  re-derive it, and evidence that contradicts it gets explained away to fit it.

## What to do

- When a skill explains a failure, state **what proves success** ("only the confirmation page
  proves a Save") and what the contrary evidence means ("a new banner is a rejection"), not a
  cause inferred from one incident.
- Check any skill claim of the form "X sometimes ignores your action" against a transcript or log
  where X was observed. A flaky control should be rare. If the claim is the skill's main explanation
  for failures, it is probably a misdiagnosis.
- When an agent loops on one step, grep the skill for the explanation it keeps quoting. A wrong
  sentence there drives the loop more often than the model does.
- Pin the corrected wording with a test that fails if the old explanation comes back
  (`workers/agent-harness/tests/unit/test_connection_setup_extractor_first.py`, "a rejected Save is
  never called swallowed").
