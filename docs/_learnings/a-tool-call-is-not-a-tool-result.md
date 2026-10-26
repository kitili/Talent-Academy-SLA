# A tool call is not a tool result

**Scope:** transferable
**Area:** anything that derives UI from the agent's tool calls in the transcript — the agent panel's
tabs and inline cards (`src/utils/agent-panel/panel.ts`), and any future reader of that shape.
**Status:** designed out for `open_panel`: `readInlineOpens`, `readPanelOpens` and `latestMapFocus`
draw only answered, unrefused calls. Designed out for the workstream rail on 2026-10-12:
`extractWorkstreamPhases` draws a `write_todos` call only once it has a result. That fix took only the
*answered* half: the rail, both of its anchor builders and the dock's `extractLatestTodos` still drew a
refused `write_todos`, which mattered once the harness began refusing plan writes (2026-10-14,
`plans/workstream-actions/plan-progress-and-honesty-gates-plan.md`); all four now skip one, through
`isFailedToolResult` or the snapshot's `errored`. The trap is open for any new reader that scans
`tool_calls` alone.

## The symptom

A workstream showed a **System map** card in the conversation — the whole system, "Entire System ·
1848 loaded", not the record that was asked about — directly above the agent's answer: *"The system
map can't open inline — it's an interactive graph … inline isn't a supported placement for it."*
The reader saw the thing the agent said did not exist.

## Why it was misleading

The panel is derived from the transcript: it scans messages for `open_panel` tool **calls** and draws
what they name. That design is right (reload is free), and every reader was written against it. But a
call exists the moment the model makes it; whether the harness **accepted** it is on a separate
message, the tool result. The run was on a harness that still refused `view="map",
placement="inline"`. It answered `Error: the 'map' view cannot be inline`, the agent believed it —
and the client, which had just learned to draw inline maps, drew one from the refused call, with no
focus because the refused call carried none.

It never showed before only because the client *also* refused inline maps. Widening one side of a
rule that both sides enforce exposed that the client had never looked at the result at all.

## The check

- A reader of `tool_calls` that draws, opens, focuses or closes something must also read the
  matching result and skip a failed one. Use `isFailedToolResult` (`agent-transcript/toolResult.ts`)
  — `status: "error"` or text opening with `Error` — the same rule the transcript draws a failed step
  with, so the two cannot disagree.
- **Do not draw a call that has no result yet, either.** This entry first said the opposite — "a run in
  flight, it should draw" — and that was the next bug. A call's arguments stream in a key at a time, and a
  call read half-way is a different call: `{path}` before `"placement": "inline"` arrived was a *panel*
  open, so the panel switched from the map to the file and back while the agent was still writing the
  call. Draw only a call that has been **answered and not refused** (`settledCallIds`). `open_panel` answers
  at once, so the wait is a fraction of a second. A call with no id cannot be matched and draws as it stands.
- **It was in a second place.** The workstream rail read the newest `write_todos` call with only an
  empty-name check, so it drew `01 C`, then `01 Capture APM`, then `01 ─ 02`, and regrouped into phases
  when the first `phase` key arrived: a rail that jumped on every chunk, in every width. Grep for
  `tool_calls` readers, not just the one that broke.
- **Waiting for the answer is half the rule.** The rail's 2026-10-12 fix checked that a result existed and
  stopped there. Harmless while the only refused `write_todos` was a parallel duplicate; once the harness
  could refuse a plan close with nothing shown, the refused call's arguments (every todo `completed`)
  would have drawn the plan as finished, on exactly the run the refusal was for. Answered *and* not refused,
  in every reader, in the same change that adds a refusal.
- **A preview is the one honest use of a half-streamed call.** The `ask_question` preview reads the
  unanswered call on purpose, to show the question while it is written. It is drawn disabled, replaced
  by the real card, and never acted on. Anything that opens, focuses or decides from a call still waits.
- When a client and a server both enforce a rule, relaxing it on one side is a test of how the other
  behaves when they disagree. Run the new client against the old server once.

## Evidence

- Thread `01a08f87-9665-7880-9ee7-d4d045e8619c` (staging): `open_panel {"view":"map","placement":"inline"}`
  → `status: error`, followed by a successful panel open focused on `Vendor Bill`.
- `tests/unit/agent-panel/inline-previews.test.ts` → *a refused open_panel draws nothing*, including *a call streamed
  half-way never flashes a tab*.
- Local thread `01a0d271-7fd2-7041-8f36-cd1c2a9e12db`: one `open_panel {path, placement: "inline"}` call, and the
  panel flickered from the map to the file and back while it streamed.
- `tests/unit/workstream-actions/workstream-phases.test.ts` → *a plan still being written keeps the last finished
  one on the rail*, *a partial plan with no finished one before it draws nothing*, and *a refused plan write*
  (*is not drawn*, *anchors nothing it claimed to start*); `tests/unit/builder/agent-stepper.test.ts` →
  *extractLatestTodos skips a write the harness refused*.
