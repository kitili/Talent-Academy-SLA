# A test that reads source as text cannot guard a move

**Scope:** transferable
**Area:** test strategy; `tests/**` files that `readFileSync` a route or module
and `assert.match` it. Found on `POST /api/netsuite/ingestion`, but the pattern
is repo-wide.
**Status:** closed for the ingestion start path — its dedupe rules now have
behavioural cover in `tests/unit/netsuite-ingestion/netsuiteIngestionStart.test.ts`.
Open everywhere else the pattern is the only cover.

## The symptom

A refactor plan said it would be verified by "the existing suite passing
unchanged". The suite covering the route looked like this:

```ts
const ingestionRouteSource = readFileSync(resolve('src/app/api/netsuite/ingestion/route.ts'), 'utf8')
assert.match(ingestionRouteSource, /includeMetadataCatalogSchema/)
assert.match(ingestionRoute, /loadReusableNetSuiteConnectionForCanvas/)
```

Nothing called the route. Nothing called the three private functions that stop
a second account-wide extraction from starting. The plan's safety net had a hole
exactly where its risk was, and it was invisible from the test *names*, which
read like coverage.

## Why it catches competent people

Source-text contract tests are legitimate for what they were written for: pinning
that a module *references* a shared helper, or that an option *flows through* a
file, when the alternative is a heavy integration harness. This repo has dozens
and most are fine.

The trap is using them as the safety net for a **refactor**. A move changes
exactly the thing they assert on — where text lives — while leaving exactly the
thing they cannot see — behaviour — at risk. So after the move they either:

- **fail as noise**, because the phrase is now in another file, tempting someone
  to relax the regex or delete the test to get green; or
- **keep passing** because the phrase is still somewhere in the file, while the
  logic behind it has quietly changed.

Neither outcome tells you whether the rule still holds. Green means nothing.

And the specific failure here is quiet and expensive: a model retries a lost
call, the dedupe rule is subtly broken, a second full extraction starts, and
nobody finds out until the bill or the duplicated data.

## What to do instead

1. **Before moving code, ask what actually executes it.** `grep -l` the function
   names across `tests/`; if every hit is inside a `readFileSync`'d string, the
   answer is nothing.
2. **Write characterisation tests first, against current behaviour**, however
   odd that behaviour looks. If a rule turns out to be a consequence rather than
   a design (the ingestion same-connection lookup filters by caller, so a
   colleague's job reads as "another connection"), the test says so in its name
   and its comment. Changing it later is then a declared change, not a silent
   one.
3. **Lift private helpers to make them reachable**, with the client or the
   dependency as a parameter. If a function creates its own database client, it
   is not testable, whatever the coverage report says.
4. **Mutation-check** each rule: break it, confirm exactly the test that claims
   it fails, restore. A characterisation test that survives its own mutation is
   theatre.
5. **Then** move the orchestration. The source-text tests that referenced the
   old location get pointed at the new one, or replaced — decided in the diff,
   never relaxed to pass.

## How to spot it in review

A plan or PR that says "verified by the existing suite passing" for a refactor
should be asked: *which test calls this?* If the answer starts with
`readFileSync`, the verification claim is empty.

## Related

- [the-filename-is-not-the-deletion-scope.md](the-filename-is-not-the-deletion-scope.md) —
  the mirror trap: a test's *name* misleading about what it protects.
- [newline-anchored-matching-fails-only-on-windows.md](newline-anchored-matching-fails-only-on-windows.md) —
  source-text tests have their own platform pitfalls too.
