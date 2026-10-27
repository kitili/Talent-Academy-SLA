# A schema keyword can also be an argument name

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/tool_surface/schema.py` (the cleaner that strips
Pydantic noise from the tool schemas the model is shown), 2026-10-02. Plan:
`plans/splotch-agent/harness-token-diet-plan.md`, F2.

## The trap

Pydantic titles every field and nested model (`"title": "SelectedNode"`), and the obvious way to strip
that is to walk the JSON schema and drop every `title` key. That walk deletes real arguments. In a JSON
schema, the keys under `properties` are **argument names**, not keywords, and real tools use keyword
names for their arguments:

- `create_report.title` and `open_panel.title`
- `task.description`
- `ask_question`'s option model has a `description` field

A key-blind cleaner removes `create_report`'s `title` argument from the schema. The model is no longer
told the argument exists. Nothing errors: the request is valid, the tool still validates on execution
(against its own, uncleaned schema), and the only symptom is the model omitting an argument or putting
the value somewhere else.

## Why it is easy to miss

- A spike on a toy tool passes, because toy tools have no argument called `title`.
- The token saving looks right, because a dropped argument is also a saving.
- Each tool's execution path is unchanged, so its existing tests still pass.

## The check

- Walk the schema by **keyword**: under `properties`, `$defs`, `definitions` and `patternProperties`,
  keep every key and clean only the values. Drop `title` only where it is a keyword.
- Assert over **every registered tool**, not a sample: the cleaned schema has the same property names
  and the same `required` list as the generated one. `tests/unit/test_tool_schema_cleaning.py`
  (`test_cleaning_keeps_every_registered_tools_arguments_and_required_list`) does this, and
  `test_an_argument_named_title_is_data_and_survives` pins the case.
- The same applies to any transform of tool JSON: `default`, `description`, `type` and `required` are
  all plausible argument names.
