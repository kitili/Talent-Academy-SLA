# A message to a busy session waits for its turn to end

**Scope:** transferable
**Area:** orchestrating worker sessions with `SendMessage`, `mcp__ccd_session_mgmt__stop_session` and
`skills/orchestration-skill/SKILL.md` (*Pause, Resume And Restarts*).
**Status:** open; the pause recipe below works around it.

## The symptom

Asked to pause three workers, the orchestrator sent each one a "pause now" message. All three sends succeeded, and
each result said:

```text
Message queued for session … that session is holding it (a turn is in progress there, or its host or process is away)
and runs it when that clears.
```

The workers kept working. None of them would read the pause until their turns ended, possibly after finishing the very
work the pause was meant to hold.

## Why it was misleading

"Delivered" and "success: true" read as "the worker now knows". Earlier messages to idle workers had taken effect at
once, because an idle worker starts a new turn on a message. The difference between idle and busy is not visible from
the sending side, except in the wording of the result.

## Why it happens

A session processes one turn at a time. A message to a busy session is queued, not injected into the running turn, and
runs only when that turn ends. A long turn (a test suite, removal proofs, a build) can run for many minutes. Stopping
the turn does not discard the queue: the stop tool says the session "stays open; anything already queued there runs
next".

## What to do

- Read the send result. "Message queued … runs it when that clears" means the worker hasn't seen it yet.
- To pause a busy worker, send the pause message first (restore any removal-proof mutation, stop background runs, commit
  a WIP checkpoint, end the turn), then stop its turn. The queued message runs next, and the worker pauses cleanly instead of
  being cut off mid-command (2026-10-20: three workers paused this way, one with a WIP commit, two clean).
- Don't stop a turn without a queued message: the worker is left mid-command with nothing telling it what to clean up.
