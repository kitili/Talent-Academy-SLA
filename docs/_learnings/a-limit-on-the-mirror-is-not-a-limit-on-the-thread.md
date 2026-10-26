# A limit on the mirror is not a limit on the thread

**Scope:** transferable
**Area:** agent transcripts and workstream playback. Found 2026-09-28 while
checking whether an MCP client could pull a workstream's conversation.

## The symptom

Five documents said persisted transcripts "keep the latest 200 messages".
Playback's docs, written on 2026-09-27, built on it: "a workstream longer than
the 200-message persisted snapshot replays from where that snapshot begins".
The playback plan and the workstream future-improvements page listed the same
limit as something worth putting on screen.

Nothing on screen was wrong. The docs were wrong in two independent ways:

- **The number was stale.** `ef18f597a` (2026-07-07, "bound browser transcript
  memory") cut `AGENT_CHAT_MESSAGE_SNAPSHOT_LIMIT` from 200 to 80. It changed
  three code files and no doc. All four places that declare the constant say
  80.
- **The store was the wrong one.** Playback replays `stream.messages`: the
  thread as LangGraph holds it, fetched through `/api/agent`. The snapshot is
  `splotch_agent_chats.messages`. The workstream screen never reads it and never
  writes its own row's copy, so on a workstream that copy is normally empty.
  Neither number ever bounded a replay.

## Why it was misleading

One conversation lives in two stores, and the docs call both "the transcript".

| Store | Holds | Written by | Read by |
| --- | --- | --- | --- |
| LangGraph thread, `values.messages` | Every message. Summarization records a `summarization_event` and trims only what is sent to the model | The harness, on every run | `useStream` (`threads.getState`) on every conversation screen, playback, and Copy as markdown on the active chat |
| `splotch_agent_chats.messages` | A window: the latest 80 messages, widened until it holds six visible replies, never beyond 400; each tool result budgeted | The dock after each run, fork (for the new chat), onboarding | The dock's instant paint when switching chats (`GET /api/agent-chats/[chatId]`), and Copy as markdown on other rows |

A sentence about the second store reads as a fact about the first. The stale
number made it worse, but a correct number would have been just as wrong
applied to playback.

It also shapes design. A server-side "pull this workstream" was first sketched
to read the mirror, because the docs described it as the persisted transcript.
For a workstream it is empty. The only complete copy is the LangGraph thread,
and `src/` has no server-side reader of it.

## The check

- For any "keeps N messages", grep the constant rather than the prose:
  `grep -rn "SNAPSHOT_LIMIT *=" src`.
- Before quoting a limit for a surface, find which store that surface reads.
  `stream.messages` or `useStream` means the thread. `agentChatMessagesQuery` or
  `/api/agent-chats` means the mirror.
- When a commit changes a limit that the docs quote, grep `docs/` and `plans/`
  for the old number in the same change.
