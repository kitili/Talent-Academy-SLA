# A model call retried after its first token streams the answer twice

**Scope:** transferable
**Area:** agent harness — `workers/agent-harness/src/middleware/model_retry/middleware.py`; any retry wrapped around a
streaming LLM call (`wrap_model_call`, a tenacity decorator, a `try/except` around `ainvoke`).
**Status:** designed out on 2026-10-14 (PROVIDER-DROP, I-24): the retry watches the stream's own callbacks and retries a
dropped connection only while nothing has streamed.

## The symptom

Test 6 of the 2026-10-13 SI run ended a send with "An internal error occurred". LangSmith showed a Fireworks `ReadError`
inside the model call, after the first token. The obvious fix, adding transport errors to the retry middleware's list,
would have re-streamed the answer: the reader sees the opening of the reply, then a second copy under it.

## Why it was misleading

The retry wrapper sees the call as one awaited value (`await handler(request)`): either a finished message or an
exception, and nothing in between. From there a failed call looks like it produced nothing, so retrying it looks free.
The middleware's own docstring said the case was rare, because the statuses it retried arrive at stream setup.

## Why it happens

Tokens do not leave through the return value. LangChain fires `on_llm_new_token` (or, on the v2 protocol,
`on_stream_event`) for each chunk, and LangGraph's `messages` stream forwards those callbacks to the client as they
happen. By the time the exception reaches the wrapper, the chunks before it are already on the reader's screen, and a
retry is a second answer, under a new message id.

The other half: a provider's first chunk often carries nothing to show (Fireworks sends the role first). LangSmith counts
it as the "first token", so "the error came after the first token" did not by itself mean the reader saw anything.

## What to do

- Decide from the stream, not the exception. Attach a callback handler for the attempt (here through
  `register_configure_hook`, as `timing_middleware/first_token.py` does) and record whether a chunk carried text, a tool
  call or reasoning. Retry only while it has not.
- After output, end the run with a typed error and let the reader choose; keep the partial answer visible and marked.
- Test it through a compiled graph streamed with `stream_mode="messages"` and a model that raises mid-stream
  (`tests/unit/test_model_connection_drop.py`), and assert both the attempt count and what the stream carried.
