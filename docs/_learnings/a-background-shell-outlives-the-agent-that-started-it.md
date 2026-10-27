# A background shell outlives the agent that started it

**Scope:** transferable
**Area:** orchestrating sub-agents (workers) that run shell commands in the background; any machine shared by test runs and agents.
**Status:** open (a process rule in `.claude/CLAUDE.md` step 4 and the worker brief, since 2026-10-06)

## The symptom

On 2026-10-06 the Background tasks pane showed four tasks running for 1 to 1.5 hours after the workers that started them had reported and stopped:

- "Wait for the harness pytest to finish": `until grep -qE "passed|failed|error" <(tail -c 400 …/pytest2.txt | grep -E " in [0-9.]+s"); do sleep 5; done`
- "Find the SuiteCloud SDK jar location": `find / -maxdepth 6 -name "cli-*.jar"`, plus a second `find / … "cli-2025*.jar"` whose parent shell had already gone
- "Find SQL migrations for build admissions"

The two `find` processes had used **3,569 s and 3,170 s of CPU**, about a full core each for an hour. A full suite run in that window took 14 minutes instead of 10 to 12.

## Why it was misleading

The workers' reports were complete and correct: the harness tests had passed (1,866) and the jar had been found another way. So nothing looked wrong. Each worker had finished, and its leftovers no longer belonged to any task anyone was watching. Asked what the "harness pytest" was waiting for, the orchestrator checked for a running pytest, found none, and at first called the pane stale. The process to look for was the wait loop, not pytest.

## Why it happens

- **A background command isn't tied to the agent's lifetime.** A worker that starts a shell with "run in background" and then reports leaves that shell running. Nothing reaps it.
- **A wait loop with no time limit never ends if its condition never holds.** The pytest above finished, but its output never matched the loop's pattern.
- **`find /` on Windows under Git Bash walks every mounted drive,** including `C:\Windows` and the user profile. Even with `-maxdepth 6` it runs for over an hour.

## What to do

- **In every worker brief:**
  - never search the whole disk; use `git ls-files`, grep in the repository, or the known location (the SuiteCloud jar is in `~/.suitecloud-sdk/cli/`);
  - give every wait loop a time limit (`timeout 900 bash -c 'until …; do sleep 5; done'`), or rely on the harness's own completion notice instead of polling.
- **When a worker reports, sweep its leftovers.** List the shells it left (on Windows: `Get-CimInstance Win32_Process` filtered on `bash.exe`/`find.exe` and the worker's worktree path or scratch file) and stop them. `taskkill /T` can leave a `find.exe` behind; `Stop-Process -Force` ends it.
- **When the user asks about a long-running background task, look for its command,** not for the process its name mentions.
