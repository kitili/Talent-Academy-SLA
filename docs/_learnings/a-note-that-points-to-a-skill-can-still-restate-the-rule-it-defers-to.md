# A note that points to a skill can still restate the rule it defers to

**Scope:** transferable
**Area:** instruction text the app injects into a user turn (`src/utils/workstreams/planningBrief.ts`) and the
skill it points the agent at (`manage-workstreams/references/planning-a-blank-workstream.md`).
**Status:** fixed on 2026-10-14 (track F of the SI test run remediation): the note now defers to the skill's
rule and a test fails if it says "not a brief" again.

## The symptom

Every blank workstream in the 2026-10-13 SI test run opened with an interview card, including "Rename account
4210 to 'Revenue - Professional Services'." ("what would make this workstream done?"). 17 of 22 traces
put a card before any answer or plan; the one run that skipped it reached its approval card in 3 minutes.

## Why it was misleading

The note's own comment said it "deliberately does not restate the interview or the plan's shape — the skill
owns those". So the fix looked like a skill edit: change the skill's "Interview first" and the behaviour
follows. It would not have: the note carried its own "**Interview the reader** … Their opening message is the
beginning of that, not a brief", in the user turn, on every blank first turn.

## Why it happens

A routing note grows a one-line summary of what it routes to ("so the agent knows what this is for"). The
summary is a second copy of the rule, closer to the model than the skill (it rides in the turn; the skill is
read later), and nothing ties the two together. When the skill changes, the note keeps teaching the old rule,
and a weaker model follows the nearer text.

## What to do

- When changing a rule in a skill, grep the app and the harness for its key phrases (here "interview",
  "not a brief") outside the skills folder: notes, briefs, prompts, tool descriptions and eval fixtures that
  copy them (C30's `_PLANNING_BRIEF` held a third copy).
- Keep a routing note to state and pointer: what is true now, which file to read. If it must summarise,
  pin the summary against the skill in a test, and a negative assertion for the old wording.
