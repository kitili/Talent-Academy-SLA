# A user message can carry text the user never wrote

**Scope:** transferable
**Area:** anything that classifies or forwards "the user's message"; here model routing
(`workers/agent-harness/src/middleware/dymanic_model/router.py`). Found 2026-10-19 on staging.
**Status:** designed out on 2026-10-19 by `CLIENT_NOTE_PREFIX` in `router.py`.

## The symptom

```text
[model-route] {'route': 'fallback', ..., 'tier': 'light', 'confidence': 0.14, 'fallback_reason': 'low confidence'}
```

A "hello" typed into a blank workstream fell back to the app's model. The same "hello" sent to Jev
from a script came back `light` at 1.0.

## Why it was misleading

The latest `HumanMessage` looked like the obvious place to find what the user typed, and every unit
test built it from user text. On some surfaces the app appends a brief as a second text block on
that same message: `[Surface note — added by the Splotch client, not written by the user.]`. The
briefs come from `openingBrief.ts`, `kickoffBrief.ts` and `planningBrief.ts`. The brief was 1,458
characters against 5 typed ones, so the classifier mostly judged the app's instructions.

## What to do

- Before classifying, forwarding or logging "the user's message", look at a real one from each
  surface, not a hand-built one.
- Strip client-added blocks by their marker.
- Pin that marker to its source with a test, so a reworded brief fails the test instead of quietly
  reaching the classifier again (`test_the_client_note_prefix_matches_every_app_brief`).
