# An eval's reading of a tool default is a second copy of it

**Scope:** transferable

## The symptom

None, which is the trap. Giving `json_query` `[]` and `{...}` paths (2026-10-09)
made a fan-out path read values without a `mode` argument. Every test passed. Two
eval rules would have gone on scoring the old default:

- `evals/target/fake_api.py`'s `is_passable` let a `json_query` call through as
  orientation when `args.get("mode") or "keys"` was `keys`. A projection with no
  mode reads values, and would have been passed as a keys listing.
- C45's forbid matched a value read by `mode` alone
  (`lambda m: m not in (None, "", "keys")`). A projection of the saved config by
  the main agent, the exact behaviour C45 forbids, would have passed it.

## Why it was misleading

The eval runner never calls the tool to decide; it reads the call's arguments and
fills in the default itself. So the default lives in two places, the tool's
signature and the eval's `or "keys"`, and only one of them is under test. Changing
the tool changes production behaviour and leaves the eval scoring the old one,
with nothing red.

## The check

When you change what a tool does with a missing or default argument:

```
rg -n '"<tool_name>"' workers/agent-harness/evals
```

and read every hit that inspects `args`. Where the eval resolves the default,
make it call the tool's own resolver (`fake_api.py` now imports
`effective_mode`), so there is one copy.

## Evidence

- `fake_api.py` `is_passable` and C45's added path forbid, branch
  `fix/harness-optimization`, 2026-10-09.
- Related: [the-model-reads-the-compact-tool-description.md](the-model-reads-the-compact-tool-description.md),
  the same shape of trap for tool descriptions.
