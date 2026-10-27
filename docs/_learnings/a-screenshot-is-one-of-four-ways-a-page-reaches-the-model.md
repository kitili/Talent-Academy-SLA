# A screenshot is one of four ways a page reaches the model

**Scope:** transferable
**Area:** the computer-use browser (`workers/agent-harness/src/middleware/computer_use_middleware/session.py`,
`tools/computer_tool.py`).
**Status:** designed out for NetSuite's one-time secrets on 2026-10-08 (`_mask_credential_secrets`).
Since 2026-10-20 the guard **fails open** (`CREDENTIAL_GUARD_FAILS_CLOSED = False`): it still masks every
secret it can find, but a frame it cannot vouch for is captured with a warning, until the bounded retry on
navigation ships (`tasks/unprioritised/restore-the-credential-page-safeguard-with-a-bounded-retry-on-navigation.md`).

## The trap

The finding read "the consumer secret is screenshotted". The tempting fix is to blur or crop the
screenshot. It would have closed one of four channels. Each action's result carries the page to the
model by:

1. the screenshot pixels;
2. the `Selected text` echo (up to 512 characters, deliberately exact so the model need not read a
   JPEG), which a triple-click that runs past the key line fills with the secret as text;
3. the element digest, whose entry names come from `innerText`, `value`, `title` and `aria-label`,
   cut at 60 characters (a 64-hex secret loses only its last four);
4. the `read_selection` action, which returns the selection as the whole result.

Masking the image leaves 2 to 4 reading the same DOM.

## What works

Edit the DOM, once, before any of them is read: overwrite the secret in the page itself, then take the
digest, the selection and the pixels, in that order. There is no unmasked copy to redact afterwards.
Two things bit while building it:

- **The guard runs on every capture, so it meets its own work.** A masked page must still read as
  "a credential page with its value masked". The first version recognised only a hex-shaped value,
  found the bullets unrecognisable, and refused the second capture of every page it had just masked.
- **Fail closed needs a definition of "cannot confirm".** Here: the overwrite did not take; a 64-hex
  on a credential page that is neither masked nor beside a key label (so a value before its label
  is never guessed at); the one-time warning with no label we know; an on-screen frame that cannot
  be evaluated. A hidden or detached helper frame must not count, or every NetSuite page with one
  would stop the browser.
- **"Cannot be evaluated" included every page still loading.** (2026-10-20.) The main frame is always
  on screen, and a navigation in flight destroys its execution context. `_step` settles for 800 ms, and
  `wait_for_load_state("load")` returns at once because the old document is still loaded, so every
  click that opened a NetSuite page answering in over ~0.8 s was refused as "a one-time credentials
  page" (5 of 5 in a local repro). FMC's sandbox onboarding lost the browser in PROD that way, and the
  refusal's wording sent the agent and the customer looking for a credential that was not there. A
  fail-closed check needs a test that navigates during the capture. Retry the walk after `load` before
  calling a frame unreadable, and word the refusal by its cause. Until that ships the guard fails open.

See `docs/splotch-agent/operations.md`, *Credential-page guard*.
