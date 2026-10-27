# A default read window is a length limit on every skill

**Scope:** transferable
**Area:** `read_file` (`workers/agent-harness/src/middleware/filesystem_middleware/tools/read_file/`),
the skills catalog prompt (`skills_middleware/prompt.py`), and every `SKILL.md` longer than 200 lines.
**Status:** designed out for `SKILL.md` on 2026-09-30 (D7 of
`plans/splotch-agent/langsmith-trace-review-plan.md`). Fixed at the pointer for one reference on 2026-10-26 (plan 17
Amendment 2, below). Still open for the other skill **reference** files.

## The trap

The catalog told the agent to "read its `SKILL.md`", and the agent did: `read_file(path)`, with no
`limit`. `read_file`'s default window is 200 lines (`DEFAULT_READ_LIMIT`), so every skill longer than
that was cut off mid-text. The result ended with `[Showing lines 1-200 of 473. Use offset/limit to
read more.]`, and the agent almost never did.

- **Measured over 14 days of LangSmith traces:** 85 of 106 (thread, skill) reads of a `SKILL.md`
  over 200 lines never went past line 200. `manage-workstreams` was cut short in 27 of 29 threads and
  `splotch-system-map` in 17 of 20.
- **What it cost:** the `todoId` form of `PATCH /api/workstreams/{id}/todos` sat at line 356 of
  `manage-workstreams/SKILL.md`, and `todos[N]: expected a non-empty string: todoId` kept recurring.
  Six product skills were 226–759 lines long, so each had a tail no run read.

## Why it is easy to miss

The skill loads, the read succeeds, and the agent acts with confidence on the half it has. Nothing
fails at the point of truncation; the failure turns up later as a rule the agent "ignored". Reading
the skill file, you see the rule and conclude the agent disobeyed it. The spec's size budget
(`test_skill_spec_conformance.py`: 500 lines, ~5,000 tokens) does not help either: it is more than
twice the window, so a skill can be within budget and still be half-read.

## The check

- For any rule an agent keeps breaking, find its line number in the skill and compare it with
  `DEFAULT_READ_LIMIT`. A rule past the window was probably never read.
- In traces, look at the `read_file` result for a skill: a `Showing lines 1-200 of N` footer with no
  follow-up read means the tail was never seen.

## The remedy

- `read_file` with no `limit` now returns a `SKILL.md` served from the skills mount whole, up to the
  20K-token read cap. Other files keep 200 lines. `test_read_file_whole_skill.py` fails if any real
  skill stops fitting one read.
- The long skills open with a `## Hard rules` block, so the rules that are broken most survive a read
  that passes a `limit`.
- **Still open:** reference files are loaded on demand and keep the 200-line window. On 2026-09-30,
  four exceeded it: `netsuite-account-data-retrieval/references/api.md` (~216),
  `netsuite-connection-setup/references/credentials.md` (226),
  `netsuite-account-evaluation/references/workflow-roi-framework.md` (276), and
  `foundation-skills/docx/references/splotch-report.example.json` (653). In the last one the example
  callout is at line ~615, so the "model new documents on it" example was never seen whole. The
  catalog prompt now says to read a reference to its end. Extending the whole-file default to skill
  references is the structural fix.
- **Fixed at the pointer, for the shared Scope it reference (2026-10-26).**
  `build-customization/references/the-action-plan-in-scope-it.md` was 244 lines, so a plain `read_file` ended in the first
  line of its section 5: the failure rule, the combined board and the rule for a request made later were in the unread
  tail, and that was already so before eight playbooks read it. Every pointer to it, in all eight playbooks and the three
  `manage-workstreams` references that name it, now reads `read_file(path, limit=400)` (a pin fails on any bare
  mention), and the reference (381 lines) says so in its fourth rule. `test_action_plan_in_scope_it.py`
  fails if the reference grows past the 400 lines the pointer names, or if `DEFAULT_READ_LIMIT` changes, and
  `test_scope_it_playbooks.py` pins the pointer in the five NetSuite playbooks. This does not fix the other reference files:
  a reference longer than 200 lines and read with a plain `read_file` is still cut off. When one carries a rule, put a
  `limit` in the pointer that names it, and pin that the file stays under it.
