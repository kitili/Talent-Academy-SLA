# A sendable MIME type is not a sendable image

**Scope:** transferable
**Area:** agent harness — `read_file`, `ToolCallRepairMiddleware`,
`media_support.py`; the app's stream-error toast
**Status:** fixed 2026-09-18 — the rule now checks pixels and payload as well as
type, `read_file` downscales, the repair middleware repairs by size, and a
provider 400 is told apart from a fault in the chat

## The symptom

A user attached a JPEG of a subsidiary hierarchy and asked whether it matched
the ingested account. Splotch called `read_file` on it. That tool call has no
output in the transcript, and the seven user messages after it — "can you try
again?", two real questions, "help", "help" — got no reply at all. No error.
The chat looked alive and was dead.

The toast, when it showed, said *"Something went wrong on our side… Send a
message to pick up where it left off."* Sending a message was the one thing
that could not work.

## Why it catches competent people

The harness had already learned half of this lesson, the hard way. A `.zip`
returned by `read_file` as a `file` block had wedged a customer thread the same
way, and the fix was careful and correct: `media_support.py` became "the one
place that decides what may become a media block", `read_file` refused to
build anything else, and a repair middleware stripped what an earlier version
had already persisted. Its docstring explains the mechanism precisely — a
rejected tool result lives in the checkpoint, so every later turn replays it
and fails before the model reads the new message.

That rule was keyed on **MIME type**. `image/jpeg` is sendable. So a JPEG chart
well under the byte cap — wide rather than heavy; charts compress — passed the
guard, became a block, and was rejected by the provider on **pixels** (over
8000 px on its long edge; the tool checked bytes, never dimensions). And
because the repair middleware used the same predicate, it looked at the
poisoned block on every replay, saw a sendable type, and passed it through
untouched. The safety net inherited the blind spot of the check it was built
to back up.

The general shape: a guard on a file's *label* feels like a guard on the file.
Every provider limit that is not about the label — dimensions, payload size,
decodability, animation — is invisible to it, and a repair layer written
against the same label is invisible to them too.

## What to do instead

1. **Ask what the provider actually checks**, from its documentation, not from
   what the file claims to be. For images: type, dimensions (8000 px; 2000 px
   once a request carries more than 20 image blocks), payload size (10 MB
   base64 on the direct API, 5 MB on Bedrock/Vertex), decodability.
2. **Put every check in the one module that decides**, and make the repair
   layer call the same functions. If the repair uses a different predicate
   from the guard, it is not a repair.
3. **Prefer downscaling to refusing** where the provider would downsample
   anyway. The model's native maximum is 2576 px; pixels beyond it are paid
   for in tokens and checkpoint bytes and then discarded. Refuse only what
   cannot be decoded.
4. **Repair at the model call as well as at graph entry.** A checkpoint whose
   pending task is already `model` resumes at the model node and never passes
   back through `before_agent`. The middleware's own comment says this; the
   size repair had to honour it too.
5. **Tell the reader what kind of failure it was.** A 400 is the conversation
   carrying something the model will not take; "something went wrong on our
   side" hides the one thing they can act on, and "send a message" was, until
   the repair existed, the wrong advice.

## How to spot it in review

A media guard that reads `mime_type` and nothing else. A repair that calls
`is_sendable_*` and nothing else. A test suite for images whose fixtures are
eight bytes of a PNG header rather than an image — the existing repair test
used `"iVBORw0="`, which no image decoder accepts, and passed because the code
never decoded anything.

## Related

- `media_support.py`'s docstring — the `.zip` incident, the first half of this
  lesson.
- [hydrating-a-transcript-is-not-restoring-a-run.md](hydrating-a-transcript-is-not-restoring-a-run.md) —
  the same experience ("the chat looked completely healthy") from a different
  cause.
- [a-test-that-reads-source-as-text-cannot-guard-a-move.md](a-test-that-reads-source-as-text-cannot-guard-a-move.md) —
  a fixture that is not the thing it stands for is the same trap in a test.
- `plans/splotch-agent/image-attachment-poisoned-checkpoint-plan.md` — the
  plan this fix followed, with the decisions (2000 px, downscale, Pillow).
