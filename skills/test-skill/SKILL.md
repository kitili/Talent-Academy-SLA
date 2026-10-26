---
name: test-skill
description: Use when an agent needs to design, review, document, or improve tests — choosing the layer and runner, writing tests that exercise app-used code, faking the outside world, testing refusals, retries and resume, deciding which suite to run, and keeping a feature's test-suite.md honest. The core method is generic and portable; references/this-repository.md says where each part lives in this repository (runners, shared fixtures, examples, traps).
---

# Test Skill

## Purpose

Protect real behaviour without making the suite slow, brittle or theatrical. Start from what the system must do, rank the ways it can fail, and catch each failure at the lowest layer that can catch it honestly. Prefer simplicity: reuse the project's shared fixtures before inventing new setup, and never write a test-only helper the app does not run.

**This file is the portable core.** For this repository's layers, runners, shared fixtures, examples and recorded traps, read `references/this-repository.md`. A new project copies this file and writes its own `references/this-repository.md`.

## Design Workflow

1. **Name the boundary.** The user-visible behaviour or contract, with its inputs, outputs, side effects, permissions, persisted data, background work, external services and UI states.
2. **List the behaviours.** Happy path; edge cases; permission and cross-tenant cases; validation and errors; idempotency, retries and resume; async transitions; persistence, rollback and cleanup.
3. **Rank risk.** High: money and model spend, data loss, security and privacy, destructive or irreversible writes, cross-tenant boundaries, production migrations and backfills. Medium: user workflows, background jobs, integrations, caches, state machines. Low: formatting and copy.
4. **Choose the layer.** High-risk behaviour usually gets more than one layer.
5. **Write the test against code the app runs.** If the logic is buried in a component or route, extract a pure function the app calls and test that, plus a thin test that the caller uses it.
6. **Record it** in the feature's `docs/<feature>/test-suite.md`.

## Layers

| Layer | Best for | Usually in the default suite? |
| --- | --- | --- |
| Unit | pure rules, parsers, mappers, permission helpers, maths | yes |
| Integration | several modules together: route handlers with faked clients, services, workers, persistence and cleanup | yes |
| Browser fixture | UI in a real browser against controlled data: menus, panels, canvases, layout, focus | no (its own runner) |
| End-to-end | the few journeys that need the whole stack, against a live app | no |
| Performance | budgets for load time, bundle size, API latency | no |
| Type check | the whole build | no — run it separately |

A green test run is not a green build when the runner strips types: always run the type check too.

## Patterns

### Drive real handlers through injected dependencies

Put route logic in a function that takes its clients as arguments (`handler(req, deps)`), so a test drives the real handler with fakes. The most useful shared fakes:
- **An in-memory database client** that records every read and write, so a refusal test can assert nothing was written and a foreign row is unchanged.
- **A two-tenant fixture** resolved through the real permission resolver, for cross-tenant and permission cases.
- Build the request yourself and assert the status, the structured error (`{ error, code, remediation }`) and the side effects.

### Text contracts

A contract test reads source, docs or SQL as text and asserts a wiring fact no runtime test can see cheaply: the same name list in several services, a documented claim, a migration's shape.
- Use one only when the fact spans layers or languages, or lives in docs; prefer a behavioural test when possible.
- It cannot guard a move to another file, and it can read a dead path and stay green. Trace the live call chain from the entry point before pinning a file.
- Docs read as text mean a docs-only change can fail the suite.

### Render the real component

Prefer a static render of the real component and assert what a user or assistive technology sees. Use a DOM emulation only where an interaction must run, and a browser fixture when layout, a canvas, focus or real events matter.

### Fake the outside world, never call it

- No real model, payment, CRM or third-party calls in the default suite. Stub the HTTP client (restore it afterwards), or inject the call (`invoke`, `extract`) and return recorded answers.
- Use realistic fixtures copied from real exports, minimised and scrubbed. A test that needs a fixture kept outside git must say clearly when it is missing.
- **Fault injection and resume.** For anything that spends money or retries: simulate one bad call among many and assert that the siblings are kept, only the failed item is retried, the retries are bounded, and a resumed run re-sends nothing already saved.

### Ordered and paged reads

Test paged reads against a fake that breaks ORDER BY ties differently on every request, as real databases do. A read ordered only by a non-unique column (a timestamp) skips and repeats rows; order by a unique key.

### Refusals and removed surfaces

- A test that pins a refusal must fail when the refusal is removed, not only when its wording changes.
- When a route or method is deleted, add a test that fails if it comes back.
- A gate that only one surface can satisfy is a refusal on every other: loop the test over every surface that raises the action.

### Prove guards by removal

A guard is any check that refuses, narrows or hides: a permission or role check, a tenant or organization match, a
read-only flag, an input that is ignored unless it is allowed, an error that must never become a grant. A test can pass
with its guard gone (its setup never reaches the branch, or another check refuses first), and then it protects nothing.
Prove each guard you add or change:
1. Remove or weaken one guard (delete the check, return the permissive answer).
2. Run the focused tests. The test that claims the guard must fail, for the guard's reason. A failure elsewhere, or a
   crash, does not count.
3. Restore the guard exactly; never commit a break. Then the next guard, one at a time.
4. Report it: how many guards were proven, and any that no test caught, with the test added for it.

Required for access, cross-tenant, approval and data-boundary guards and for regression fixes; worth it wherever a
missing check would still pass. It proves the tests see the guard, not that the rule has no other home: the same rule
may also live in SQL or another layer.

### Flags and constants

Never pin a flag's default silently. Express both sides from the constant (`expected = FLAG ? newValue : oldValue`), or skip with a stated reason. Then flipping the flag shows exactly which tests describe the old path.

### Browser fixtures

- Fixture pages live in a canonical test tree that the runner copies into the app for the run and removes afterwards; no fixture route ever ships or is imported by app code.
- Add data behind a query parameter so other specs' counts stay stable.
- To prove an action "lays nothing out", compare a layout or load stamp before and after, read only once the page has settled, and do not blame an earlier navigation's layout on the action.

### Databases and migrations

Keep tests that execute against a real database out of the default suite; run them by hand and list them in the feature's `test-suite.md`. Give migrations text contracts in the default suite (shape, idempotency, grants), plus a replica run by hand where the risk warrants it.

## Which Suite To Run

- **Code, tests, scripts, migrations, workers or dependencies changed:** the full default suite, once, plus the type check. Log the run to a file and read its summary; never pipe it through `grep` or `tail`, which hides the exit code.
- **Nothing relevant changed since the last green run:** keep a record of the last green run and a script that says whether it still covers the tree, and skip the suite when it does.
- **Only docs, skills or the rules files changed:** run only the tests that read those files.
- **Parallel workers:** they run focused tests; the full suite runs once, after merge.
- **UI changed:** the browser fixture that covers it.

## What Good Tests Assert

- The right function, route or service runs for the workflow, reached from its real entry point.
- The right data is persisted, transformed or returned; invalid input is refused before any side effect.
- Unauthorized and cross-tenant callers are refused, and nothing is written.
- Long jobs report progress and terminal states; retries are bounded and idempotent; failure leaves no partial state.
- UI controls are shown, enabled or labelled by permission and state.
- Success is judged from the durable record (the row that proves it), not from a status or a screen.

Avoid: internal names with no contract meaning, incidental DOM structure, mocks of behaviour the app never runs, broad snapshots, and tests that copy the implementation.

## Test Documentation

Each feature folder keeps `docs/<feature>/test-suite.md`: the test name or id, the behaviour, the file, the layer, whether it is covered today, and accepted gaps with their reason. Never list a planned test as coverage; put gaps in their own section. List hand-run database tests there.

## Regression Workflow

1. Write or update a test that fails before the fix, at the lowest honest layer, including the edge case that broke.
2. Prove it: revert the fix, see that test fail, restore the fix (*Prove guards by removal*).
3. Run the focused tests, then the suite the change calls for.
4. Record a learning when the trap would catch someone competent again (`skills/learnings-skill`).

## Final Checklist

- Does each high-risk behaviour have a test at the right layer, driven through code the app runs?
- Are refusal, cross-tenant, failure, retry, resume and cleanup cases covered where they apply?
- Would each refusal test fail if the refusal were removed, and was each guard proven by removal?
- Are flags expressed from the constant rather than pinned?
- Did the type check and the right suite pass, read from a log file?
- Is `docs/<feature>/test-suite.md` updated, with gaps labelled?
