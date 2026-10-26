# A repair anchor that spans a line break will silently match nothing

**Scope:** transferable
**Area:** forward-only PL/pgSQL repairs (`migrations/semantic-harmony/*`)
**Status:** live trap — the CRLF files are still CRLF

## The symptom

A preflight reports that **neither** form of the clause is present:

```
stale_clause_present       = 0
reconciled_clause_present  = 0
writer_exists              = true
shape_check_present        = true
```

Both zero. Not "already applied", not "unexpected shape" — the anchor simply
does not exist in the live definition, even though you can see the exact text in
the migration that created the function.

## Why it happens

These repairs patch the live catalog definition rather than restating a
1,600-line function:

```sql
v_definition := pg_catalog.pg_get_functiondef(procedure.oid);
EXECUTE pg_catalog.replace(v_definition, v_unsafe, v_safe);
```

`pg_get_functiondef` returns the body **byte for byte as stored**, including its
line endings. The migrations in this folder are CRLF files on a Windows repo, so
the stored body's breaks are CR+LF. An anchor built like this:

```sql
v_unsafe constant text :=
    '                 WHERE document->>''role'' <> ''owner_workflow_xml''' || chr(10) ||
    '            ) THEN';
```

contains a bare LF where the body has CR+LF, and can never match. Nothing warns
you: `replace` on a string that is not present is a no-op, and an occurrence
count of zero looks exactly like "not applied yet".

It had not bitten before because every earlier repair on this function happened
to use single-line anchors — `fix_semantic_revision_v2_jsonb_key_removal`,
`drop_source_closure_completeness_gate`, `drop_closure_omission_policy_gates`.
The first multi-line anchor written was the first one to fail.

## The rule

**Anchor on one physical line. Never across a line break.**

If the change needs to add a line, append it to the existing line instead:

```sql
v_anchor      constant text := 'WHERE document->>''role'' <> ''owner_workflow_xml''';
v_replacement constant text := v_anchor || ' AND coalesce(...) /* marker */';
```

Two further habits fall out of this:

- **Leave the leading whitespace out of the anchor** when the line's content is
  already unique. Indentation is one more thing that can differ between the file
  you are reading and the body that was stored.
- **Decide idempotency on a unique marker, not on the anchor.** When the
  replacement keeps the anchor as its prefix, the anchor count stays 1 after a
  successful repair; only the marker distinguishes applied from not.

## The check

Report the line ending in the preflight, so the next person knows before writing
an anchor:

```sql
CASE
    WHEN pg_catalog.strpos(definition, chr(13) || chr(10)) > 0 THEN 'crlf'
    WHEN pg_catalog.strpos(definition, chr(10)) > 0 THEN 'lf'
    ELSE 'none'
END AS body_line_ending
```

And confirm the anchor is unique *as a substring*, not as a line:

```bash
grep -c "WHERE document->>'role' <> 'owner_workflow_xml'" migrations/<file>.sql
```

Beware near-misses: that role name also appears twice with `=` rather than `<>`
in the same function, so an anchor trimmed any further would have matched three
places.

## Why the failure was safe

Nothing was half-applied. The up migration counts occurrences and raises unless
it sees exactly the expected shape, so a zero/zero preflight stops the work
instead of writing a function that no longer parses. That fail-closed structure
is worth keeping in every repair here: the cost of a wrong anchor should be a
confusing preflight, never a broken writer.

Designed out 2026-09-20: the writer these repairs patched
(`create_workflow_semantic_revision_v2`) was removed with the DotSON V2 layer
(`plans/drivetrain/dotson-v2-deprecation-plan.md`); `migrations/semantic-harmony/`
is retired and its CRLF files stay in git as history. The rule stands for any
future forward repair that patches a live function body with `replace`.

## Related

- [one-rule-many-layers.md](one-rule-many-layers.md) — why these repairs exist at
  all: the same invariant enforced in TypeScript and again in PL/pgSQL
- `migrations/semantic-harmony/reconcile_selected_characters_with_inlined_documents.*.sql`
  — the single-line anchor pattern, with the line-ending diagnostic

## Related

- [newline-anchored-matching-fails-only-on-windows.md](newline-anchored-matching-fails-only-on-windows.md) — the same trap outside SQL, and why it shows up on Windows checkouts only.
