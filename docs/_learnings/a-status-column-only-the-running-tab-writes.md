# A status column only the running tab writes

**Scope:** transferable
**Area:** agent chats and workstreams (`splotch_agent_chats.status`, LangGraph
thread status), 2026-09-28

## The trap

The goal was to show which chats and workstreams have the agent running right
now. `splotch_agent_chats` has a `status` column typed
`idle | streaming | errored`. It has the right name and the right values, and the
agent-chat list already returns it. It is the obvious thing to read.

It can't answer the question:

- **Only the browser writes it**, through `POST /api/agent-chats`. The harness
  never does.
- `streaming` is written only when a thread id is first minted or selected
  (`useDriverAgentStream.ts`, `handleThreadId`). Later turns on the same thread
  never set it.
- `idle`/`errored` is written only when **that same tab** sees the run end. Close
  the tab, crash it, or switch chats mid-run, and the row keeps whatever it
  last said, with nothing to sweep it.
- The workstream screen never persists the chat at all, so on workstream rows
  the column never changes.

This is why `ThreadPicker` had already swapped its status dot for the date.
Nothing in the column says so.

## LangGraph's own status has two more

The authoritative source is the LangGraph deployment that holds the thread
(`client.threads.search`). Two probes of production and both staging agents
on 2026-09-28 found two further traps:

1. **`interrupted` does not mean someone has to answer.** Of 60 interrupted
   threads per deployment, 39 on production and 43 on staging had **no pending
   interrupt at all**. Some had been interrupted for 54 days. Reading
   `interrupted` as "waiting for input" would badge most of them falsely.
   Select `interrupts` and check the payload is a card the app draws; the
   transcript's parsers (`normalizeAskQuestionInterrupt` and its siblings)
   already decide that.
2. **`ids: []` is not "none".** `threads.search({ ids: [] })` returned 10
   threads nobody asked about. The deployments have **no auth handler**, so
   any server-side read sees every thread. A caller that builds `ids` from a
   filtered list must return early when the list is empty. It must also drop
   any thread in the reply it didn't ask for, in case a server version ignores
   the filter.

## The rule

- Don't read `splotch_agent_chats.status` as run state. Ask LangGraph, and ask
  only about threads whose rows the caller's own list would show.
- Don't read `interrupted` as "waiting" without looking at what is pending.
- Guard every `threads.search` against an empty `ids`.

**Status:** designed out for the workstream list and the chat picker
(`src/utils/agent-chats/threadActivity.ts`; see
[workstream-actions/architecture.md](../workstream-actions/architecture.md#live-status-on-the-list)).
The column itself is unchanged and still written by the browser, so the trap is
live for any other reader.
