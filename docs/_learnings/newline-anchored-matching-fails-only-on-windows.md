# Newline-anchored matching fails only on Windows

**Scope:** transferable
**Area:** the whole test suite; any code that reads a repository file and matches
against its text, or walks the repository and compares the paths with literals
**Status:** live trap — the repository has no `.gitattributes`

## The symptom

`yarn test` on a Windows checkout:

```
ℹ tests 7977
ℹ pass 7960
ℹ fail 11
```

The same commit on Linux, and in CI, is green. Eleven failures, in four files,
none of them related to each other or to whatever you are working on:

| File | Failures |
|---|---|
| `tests/unit/mcp/productSkills.test.ts` | 5 |
| `tests/integration/agent-contexts/reference-resolution-contract.test.ts` | 4 |
| `tests/unit/canvas/systemGraphMapPane.contract.test.ts` | 1 |
| `tests/unit/container-builds/dockerBuildContext.test.ts` | 1 (unrelated — see below) |

They stay failing across branches, so after a while they read as "the baseline",
and a genuine regression in one of those files is invisible.

## Why it happens

The repository has **no `.gitattributes`**, and Git for Windows defaults to
`core.autocrlf=true`. So:

- every blob in the repository is **LF**
- every file in a Windows working tree is **CRLF**
- every file in a Linux or CI working tree is **LF**

Nothing is misconfigured and nothing is broken. The bytes on disk simply differ
by platform, and any code that reads a repository file and matches against its
text is reading different bytes depending on where it runs.

## Three shapes it takes

**A parser anchored on `\n`.** `productSkills` reads `SKILL.md` frontmatter. The
parser splits on `\n`, so on Windows every value carries a trailing `\r`, the
frontmatter `name` never matches the directory name, and *every* skill is
dropped. The test then reports `No skill named 'netsuite-script-generation'` —
which reads as a missing fixture, sends you looking for the directory, and the
directory is right there.

**A contract test regexing over source.** Several tests assert wiring by reading
a `.tsx` and matching a pattern. `/const \[x, setX\] = useState\(''\)\n/` cannot
match `…\r\n`, and the failure prints a diff of two strings that look identical
in the terminal, because `\r` is invisible.

**Prose in JSX, which compounds it.** A sentence in a component wraps
mid-clause, so the source contains `permanently delete\n    projects` where the
rendered page reads `permanently delete projects`. A regex for the sentence fails
for a second reason that has nothing to do with line endings, and fixing only the
`\r` leaves it still failing.

The fourth file above is a different problem wearing the same clothes:
`dockerBuildContext` fails with `EPERM: scandir` on a lock-held
`.pytest_cache_codex_salesforce` directory. Worth knowing so it is not chased as
a line-ending issue.

## The rule

**Never anchor on `\n`, or on exact whitespace, in anything that reads a file
from the repository.** Normalise first. Which normalisation depends on what you
are asserting:

```ts
// Matching structure — code, config, SQL. Line breaks matter, \r does not.
const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

// Matching prose — copy in JSX or Markdown. Neither line breaks nor indentation
// change what a person reads, so collapse all of it.
const prose = readFileSync(file, 'utf8').replace(/\s+/g, ' ')
```

The second form is the stronger one wherever it applies, because it survives
reformatting as well as platform. `tests/unit/mcp/oauthConsent.test.ts` uses it
to assert the consent copy names workstreams on all three surfaces.

For a **parser** rather than a test, normalise at the read boundary — once, where
the file becomes a string — rather than at each `split('\n')`. A parser that
handles `\r\n` in one place and not another is the version that fails on a
subset of files and looks like a content problem.

## Better still: do not match source text

A test that regexes a component's source is coupled to how the code is written,
not to what it does, and line endings are only the most annoying way that bites.
Where the thing under test can be exercised instead — call the function, render
the component, assert the behaviour — do that. Source matching earns its place
for wiring that has no other observable signal (a prop passed, an import
present), and those are the cases worth keeping.

## The structural fix, and why it is not in this entry's changeset

Adding a `.gitattributes` fixes it for everyone:

```
* text=auto eol=lf
```

That normalises the working tree to LF on every platform, and the eleven failures
go away rather than being worked around one test at a time.

It is deliberately **not** done here, because it rewrites the line endings of
every file in every existing working tree on the next checkout. Anyone with
uncommitted work sees their diff explode; anyone mid-rebase has a bad day. It is
a repository-wide decision with a coordination cost, not something to slip into a
feature branch — but it is the right fix, and until it lands every new test that
reads a file has to remember this on its own.

## A fourth shape, found 2026-09-17: the parser, not the test

`parseSkillFrontmatter` (`src/services/agent-skills/productSkills.ts`) split a
`SKILL.md` on `
` and kept whatever followed the key. On a CRLF checkout every
value carried a trailing `` — a skill `name` no lookup matched, so the entire
MCP skill catalog was quietly wrong on Windows and four `productSkills` tests
had been failing here for weeks, filed under "known CRLF noise". They were not
noise: the code was wrong on this platform, and the tests were right.

Designed out by normalising `
` to `
` at the top of the parser. The
general point: when a "CRLF test failure" is in code that *reads files at
runtime* rather than in a test that reads source, it is a bug in the product,
not in the test, and the shipped behaviour differs by platform.

## A fifth shape, found 2026-09-30: path separators

This is the same family: Windows-only, green in CI, not about line endings. It arrived with the
Live Report merge from qa (`0633b8e14`). Six contract failures in
`tests/integration/live-report/{routeWiring,publicRouteWiring,analyticsWiring}.test.ts` read like
security regressions:

- "only the gate may POST, not …session/route.ts"
- "expected the share routes, found 0"

**The shape.** A test walks a directory with `node:path` `join()` and compares what it finds with
a forward-slash literal:

- `path !== SESSION`
- `path.includes('/share')`
- `deepEqual(found, ['src/app/…/route.ts'])`

On Windows `join` gives `src\app\…`, so nothing ever matches. Each literal fails in its own way:

- **An exemption stops exempting.** The gate was judged by the rules for reads.
- **A filter finds nothing.** The per-route "requires edit, not read" checks never registered at
  all. Only an existence guard (`found >= 2`) turned that into a failure rather than a silent pass.
- **An exact match lists the right files, spelled with backslashes.**

The routes were fine. The same files pass 83/83 with `join` swapped for `posix.join`.

**The rule.** A walker whose output is compared with literal paths builds them with
`posix.join` (or `` `${dir}/${entry}` ``). `readdirSync`, `statSync` and `resolve` all accept
forward slashes on Windows. Then assert that every path you exempt or pin is actually in the
walked list. The assertion is one line, and it turns this whole class of failure into a message
that names the path:

```ts
assert.ok(ROUTES.includes(SESSION), `the gate ${SESSION} is not among the swept routes`)
```

**Why this matters more than the CRLF shape.** A walker bug in an allow-list, or a skip-list,
passes vacuously. The fix is in the three Live Report wiring tests. `.gitattributes` would not
have helped, because it changes bytes, not separators.

## Related

- `plpgsql-repair-anchors.md` — the same trap in SQL: a forward-only repair
  anchor that spans a line break matches nothing, because the stored function
  bodies are CRLF. That entry is about a specific repair mechanism; this one is
  about the general shape.
- `a-refusal-test-that-passes-when-the-refusal-is-gone.md` — the other way a
  test can be green about nothing.
