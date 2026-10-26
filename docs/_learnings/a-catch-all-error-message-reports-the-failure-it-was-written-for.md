# A catch-all error message reports the failure it was written for

**Scope:** transferable
**Area:** agent harness — `computer_use_middleware/session.py` (`_BrowserWorker.run`, the Chromium launch);
any `except Exception: raise Friendly("...")` around a process launch.
**Status:** fixed 2026-10-09 (BROWSER-CAPACITY): the message carries the exception type, its first line and
Chromium's resource line; "not installed" only when the executable is missing.

## The symptom

A workstream's `open_url` answered:

> Computer use unavailable: Chromium is not installed for Playwright. Run `uv run playwright install chromium`.

Chromium was installed at `/usr/bin/chromium` and had launched minutes earlier on the same container.

## Why it was misleading

The message names a cause and a fix, so the natural next step is to check the image, the apk, the
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` setting and the Dockerfile. All of them were fine. The message was a
constant: every exception from `chromium.launch` was replaced by it, whatever it was.

## Why it happens

The handler was written when the only launch failure anyone had seen was a missing binary. Reproduced in
the container, the real error was `BrowserType.launch: Target page, context or browser has been closed`,
with Chromium's log showing `pthread_create: Resource temporarily unavailable (11)`, then
`GPU process exited unexpectedly: exit_code=6`, then a SIGKILL. The container's cgroup allowed
`pids.max = 1000` tasks (threads count), `pids.current` was 961, and five kept browser sessions held 876 of
them. A resource limit, reported as an installation problem.

A second, quieter leak sat in the same handler: a failed launch left the Playwright driver it had started
running, one more process tree per failed attempt against the same limit.

## What to do

- Never replace an exception with a fixed explanation. Carry the type and its first meaningful line
  (filter known noise such as Chromium's D-Bus lines), and log the whole thing at warning level.
- Say "not installed" only after checking that the binary is missing (`os.path.exists`, or the launcher's
  own "Executable doesn't exist" text).
- When a launch fails, ask what the process is short of before what it lacks: in a container, read
  `/sys/fs/cgroup/pids.max` and `pids.current` (and memory) first. `pthread_create: Resource temporarily
  unavailable` means a task limit, not a broken binary.
- Clean up whatever the failed attempt did start; a retry loop over a leaking launch makes the shortage worse.
