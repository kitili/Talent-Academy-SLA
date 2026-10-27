# A sandbox that refuses the standard call gets its own API ignored

**Scope:** transferable
**Area:** giving a model a code sandbox with custom functions for I/O; here `run_python` (Monty) in the
agent harness. Found 2026-10-19 on its first staging run.

## The symptom

The tool's description and the system prompt both said to read files with `await read_file(path)`. On the
first real run (a `/healthcheck` on Muse Spark), two of the four programs did
`with open("/api_responses/<id>.json") as f: data = json.load(f)` instead. The sandbox answered with a bare
`PermissionError: Permission denied`. The model did not retry with `read_file`; it gave up on the tool and
went back to `json_query` for the rest of the run.

## Why it was misleading

Every test passed, because the tests called `read_file` the way the prompt said to. The local model trial
passed too: its tasks fetched from the API, so no program needed to open a file. Only a real task that
started from a saved response hit the habit.

## Why it happens

A model writes the code it has seen most. `open()` and `json.load` are far more common in its training than
any custom function named in a prompt, and an error that only says "denied" reads as "files are off-limits",
not "use the other function".

## What to do

- Serve the standard calls (`open`, `pathlib`) from the sandbox's own storage, under the same rules as the
  custom functions, instead of only documenting the custom ones. Monty's `AbstractOS` handler does this.
- Where the sandbox's standard library has gaps (Monty's `json` has no `load`/`dump`), put the fix in the
  error the model sees, not only in the prompt.
- Test with the code a model writes by default, not only the code the prompt asks for.
