# A refusal test that passes when the refusal is gone

**Scope:** transferable
**Area:** migration postflights; production drivetrain bucket, 2026-09-15

## The symptom

There is no symptom. That is the whole problem.

A postflight proving an append-only ledger really is append-only:

```sql
BEGIN
    UPDATE public.deployment_occurrence_events
       SET event_type = 'tampered'
     WHERE deployment_occurrence_id = v_occurrence;
    v_mutable := true;
EXCEPTION WHEN OTHERS THEN
    NULL;  -- the trigger refused
END;
IF v_mutable THEN
    RAISE EXCEPTION 'occurrence events are mutable';
END IF;
```

It passes if the immutability trigger fires. It also passes if the column is
misspelled, if the table does not exist, if the role lacks UPDATE, or if the
trigger was never created — every one of which is the condition it exists to
detect.

The same shape, in a probe that a mis-kinded identity key is refused:

```sql
BEGIN
    PERFORM public.create_critical_drivetrain_splotch_v1(… 'netsuite-script:customworkflow_wrong_kind' …);
EXCEPTION WHEN OTHERS THEN v_refused := true;
END;
```

This reports success when the canvas has no process, when the actor is null,
when any argument is malformed — in short, whenever the function was never
reached.

## Why it is misleading

A positive test that silently stops testing usually goes red eventually: the
thing it asserted stops being produced. A **negative** test has no such
backstop. Its pass condition is "something went wrong", and a broad handler
accepts any wrong thing, including the setup failing before the subject ran.

It is the inverse of a normal flaky test. A flaky test fails when it should
pass, which is annoying and visible. This passes when it should fail, which is
invisible and is relied upon.

Postflights make it worse in two ways. They run once, by hand, against a
database nobody wants to experiment on — so nobody re-runs them with the
mechanism deliberately removed to check the test can fail at all. And they
are read as evidence: "the postflight passed" is what gets written in the
migration record.

## The subtler variant: right code, wrong cause

Narrowing `WHEN OTHERS` to a specific SQLSTATE is necessary and not sufficient.
In `create_critical_drivetrain_restoration_draft_v1`, **four different refusals
raise `22023`**:

```text
22023  invalid critical drivetrain restoration Draft input
22023  the restoration target is already Current
22023  restoration target was never promoted by a succeeded deployment
22023  a rollback target must belong to the same Splotch
```

So a probe asserting "a never-promoted target is refused" that matches only on
`22023` passes when the fixture's own change spec or digest is malformed — the
function refuses at its *first* validation and never evaluates the rule under
test. The check that most needs to be trustworthy is exactly the one whose
failure mode it cannot see.

## The check

**Ask of every negative test: if I deleted the mechanism, would this fail?** If
the answer is "no" or "not sure", the handler is too broad.

Concretely, for PL/pgSQL probes:

1. Catch the **specific SQLSTATE** the mechanism raises, never `WHEN OTHERS`.
2. Add a `WHEN OTHERS` arm that **fails loudly** rather than passing quietly —
   it turns "my fixture broke" into a distinct, readable error instead of a
   false pass:

```sql
EXCEPTION
    WHEN SQLSTATE '55000' THEN
        NULL;  -- the mechanism refused, as it must
    WHEN OTHERS THEN
        v_wrong := SQLSTATE || ': ' || SQLERRM;
END;
…
IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION 'the probe failed for an unrelated reason (%)', v_wrong;
END IF;
```

3. Where several refusals share a SQLSTATE, **assert the message too**:

```sql
IF v_why IS NULL OR v_why NOT LIKE '%never promoted by a succeeded deployment%' THEN
    RAISE EXCEPTION 'not refused for the right reason (%)', coalesce(v_why, '<accepted>');
END IF;
```

The cheapest way to find these: grep the postflights for `WHEN OTHERS`.

## The related anti-pattern that led here

The same file reached production three times with a broken fixture, each found
by running it and reading the one error it happened to raise: an empty file
list, then a byte count off by one, then an impacts row naming neither a process
nor a Splotch. Each fix was correct and each left the next fault in place.

Constraints are enumerable. Reading **all** of them once — every `NOT NULL`
without a default, every table-level `CHECK` — found the remaining fault before
it was run, in less time than one more round trip. For a script that only ever
runs against production, "fix the error in front of me" is the expensive
strategy.

## Evidence

Production drivetrain bucket, `migrations/drivetrain-prod/`:

- `01…postflight.sql` — the immutability probe above, narrowed to the trigger's
  own `55000` with a loud arm for anything else;
- `02…postflight.sql` — the mis-kinded-key probe, narrowed to `22023`;
- `03…postflight.sql` — two probes that shared `22023` with three sibling
  refusals, now message-asserted.

None of these was a defect in the migrations. Every one was a defect in the
evidence that the migrations were correct, which is worse: a migration fault
announces itself, and a false pass does not.

Related: [`a-swallowed-error-reads-as-an-empty-result.md`](a-swallowed-error-reads-as-an-empty-result.md)
is the same mistake in production code — an error absorbed into a value that
reads as a legitimate result. This is that error made structural, in the tests
that are supposed to catch it.
