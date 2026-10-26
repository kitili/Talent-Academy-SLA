# An opaque string the model must retype is a string it will corrupt

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/api_middleware/tools/draft_diagram/`,
`src/utils/drivetrain/draftDiagramEdit.ts`, found 2026-09-22 in a live
workstream (`chats/sales_order_scenario.md`).

## What happened

Inky's Draft diagram edit is a preview-then-apply pair: preview returns a signed
token, apply sends it back and the route replays what was previewed. The token
carried the canonical text of every element twice (before and after
fingerprints) plus the operations: ~7,500 characters of base64 for eight nodes.
The apply tool took it as a string argument, so the model had to emit it inside
a tool call. Three previews, three applies, three refusals of "not one this
server issued". The agent diagnosed a signing-key split between preview and
apply and told the user the deployment was broken.

Decoding the token the agent actually sent showed eleven fingerprint separators
`}|{` rewritten as `}}{` and escaped quotes with the backslash dropped, in each
copy. The HMAC turned one slip into a refusal that read like a server fault.

## Why it is a trap

- The model's own account of what it did is "byte-exact". It cannot tell; it is
  the copying channel, and a 7KB string with repeated structure is exactly
  where a language model substitutes a plausible neighbour for a character.
- The failure is invisible on the server side: the signature check refuses
  correctly, and the log says the token was forged.
- The harness offloads large responses to a file. The agent even saved the
  token to a second file with `json_query`. None of that helps when the only
  input to the next tool is a string the model types.

## The rule

Never make the model round-trip an opaque value between two tool calls. Keep
the value in harness state and hand the model a short handle. Here: preview
files the token at `/draft_previews/<previewId>.token` through the `present`
hook on `execute_request` and shows a sixteen-character `previewId`; apply
takes `preview_id`, reads the file, and posts the stored string. The apply tool
has no token parameter at all, so the retype path cannot be taken. Shrinking
the value (the token's fingerprints are now SHA-256 hashes, version `v2`) is
hygiene, not the fix: a few KB of operations still ride in it.

## How to check for it

- A tool argument documented as "exactly as returned" or "unchanged" is the
  smell. If the value is longer than an id, the model will not return it
  unchanged.
- In a transcript, a refusal that says "invalid signature", "not issued here"
  or "checksum mismatch" right after the model quoted a long value: decode what
  the model sent before believing the environment is misconfigured. Look for
  `}}{` where the server joins with `|`, and for `\"` become `"`.
- `tests/unit/test_draft_diagram_tools.py` pins that apply's schema has no
  token argument and that the stored token is posted byte for byte;
  `tests/integration/drivetrain/send-to-inky-contract.test.ts` pins the same
  from the app side.
