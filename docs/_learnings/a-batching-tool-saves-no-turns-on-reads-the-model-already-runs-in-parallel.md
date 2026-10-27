# A batching tool saves no turns on reads the model already runs in parallel

**Scope:** transferable
**Area:** measuring an agent tool that folds many calls into one program (here `run_python`, a
sandboxed Python tool that can call the product API). Found 2026-10-19 while measuring it before
shipping.

## The symptom

The obvious benchmark said the tool did nothing. The task was "list 25 scripts, then read each one's
detail". With the code tool, GLM 5.3 Flash took 4 model turns and 68.3K input tokens; without it,
3 turns and 60.6K. Muse Spark Open was the same: 5 turns with it, 4 without.

## Why it was misleading

The "without" side was not 26 sequential calls. Both models put all 25 detail reads into one turn as
parallel tool calls, so the baseline already had the batching the tool was meant to add. What the tool
still changed was invisible in turns and in that single answer's tokens: the transcript was 2.8K
characters instead of 83K, and that difference is paid on every later call of the conversation.

## Why it happens

Modern tool-calling models issue independent calls in parallel. A batching tool only removes turns
when each call needs the previous call's answer: paging with a cursor, a list followed by details, a
search followed by reads. On that shape the same models went from 7 turns, 137K tokens and 68 s to
4 turns, 74K and 36 s (Muse), and from 10 turns and 184K to 8 and 138K (GLM).

## How to measure it

- Build the benchmark from a dependent chain (paging, list then detail), not a flat fan-out.
- Count the transcript left behind as well as turns and tokens of the one answer: a long conversation
  re-reads it on every call until it is summarized.
- Measure on the models you route to; cheaper models also make more code errors (a forgotten import),
  which costs turns back.
