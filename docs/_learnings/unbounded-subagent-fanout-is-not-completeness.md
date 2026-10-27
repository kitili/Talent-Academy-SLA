# Unbounded subagent fan-out is not completeness

**Scope:** transferable
**Area:** Splotch agent delegation and Build impact assessment
**Status:** bounded-wave contract added after the 2026-08-30 staging failure

## Symptom

A Build impact assessment covered 42 processes and emitted seven sibling
`task` calls in one model turn. The report completed, but the Railway agent
endpoint became unreachable before the subsequent approval resume reached
LangGraph. DNS continued to resolve while TCP/443 was closed.

Railway logs were not available, so an out-of-memory kill is not proven. The
code still revealed a separate, concrete defect: the skill prescribed one
same-turn delegation per cluster and the task middleware placed no runtime cap
on concurrent child graphs.

## Why this is misleading

"Investigate every cluster" is a coverage requirement. "Start every cluster
at once" is a scheduling choice. Treating the two as equivalent makes load
depend on how many tool calls the model emits, while each child also receives a
copy of the parent virtual file system. A prompt-only request to be careful is
not a resource boundary because a future skill or model turn can ignore it.

## The durable contract

- Preserve complete HIGH/MEDIUM coverage and the aggregate LOW review. Since
  2026-09-14 the LOW *review* is still mandatory but its *delegation* is not:
  when there is no HIGH/MEDIUM process, every returned impact is LOW, the only
  evidence kind is `same_functional_process`, and there are zero external
  dependency edges, the main agent writes `findings/low-severity-summary.md`
  itself and emits no LOW `task` call. All four conditions must be proven —
  uncertainty fails closed back to a sub-agent. So "no LOW task call in the
  transcript" is not evidence of skipped coverage; an *absent
  low-severity-summary.md* is.
- Dispatch impact clusters in waves of at most three `task` calls, merging one
  wave before asking for the next.
- Enforce the same ceiling inside the async task tool so model behavior cannot
  exceed process capacity.
- Keep waiting for capacity cancellable and retain `aclosing` around the child
  stream so a cancelled parent tears the child down.

Timeouts, VFS-delta merging, and independent worker replicas are useful further
resilience work, but they are not substitutes for a concurrency ceiling.

## Concrete check

The task-tool unit test launches more than three async delegations behind a
barrier and asserts that peak child execution never exceeds three. Skill text
must also forbid more than three sibling `task` calls in one turn.

## Related

- `workers/agent-harness/src/middleware/subagent_middleware/task_tool.py`
- `workers/agent-harness/src/skills/product-skills/netsuite-change-impact-assessment/SKILL.md`
- `workers/agent-harness/tests/unit/test_subagent_task_tool.py`
- `plans/drivetrain/critical-drivetrain-failed-approval-resume-recovery-fix-plan.md`
