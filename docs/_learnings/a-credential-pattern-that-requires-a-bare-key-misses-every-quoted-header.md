# A credential pattern that requires a bare key misses every quoted header

**Scope:** transferable
**Area:** secret redaction on text that leaves the system: `src/utils/security/credentialRedaction.ts`, applied by the MCP `netsuite_read_source` read (`src/services/mcp/netsuiteEvidenceReads.ts`).
**Status:** fixed for the MCP source read on 2026-10-07 (branch `fix/source-credential-redaction`); the other paths that send source out are still unredacted (see `docs/mcp/future-improvements.md`).

## The symptom

On 2026-10-07 a read-only evaluation called `netsuite_read_source` on a customer's Quickbase integration script. The answer carried a Quickbase user token in clear, in the header object around line 30, and a second token on the commented-out line beside it. The answer had **no `redactions` list**: as far as the redactor knew, there was nothing to withhold.

## Why it was misleading

The redactor had a named-credential shape that listed `authorization` among its names, and it had been measured on PROD the day before: "matched nothing in 79 persisted script bodies, 92 retained script files and 1,152 SDF objects". That was read as "safe", and it was, for false positives. Nobody had measured recall. There were no labelled positives, so "matched nothing" could equally have meant "finds nothing".

## Why it happens

The shape was `\b(?:…|authorization|password|…)\s*[:=]\s*"…"`: the colon had to follow the name, with only whitespace between. Real code quotes the key:

```js
const HTTP_HEADERS = {
    "Authorization": "QB-USER-TOKEN <token>",
    // "Authorization": "QB-USER-TOKEN <old token>",
};
```

Measured on PROD the same day (read-only, every `scripts` body of every version and the retained SDF files and objects of 38 accounts' newest versions): the fixed rules found 15 distinct credential values in 6 NetSuite accounts (12 projects); the original five shapes had found 5 of them. The 10 they missed were 3 `Authorization` header values in quoted-key header maps (a Basic credential repeated across 6 projects of one account, and two Quickbase tokens), 5 secrets in script-parameter XML elements, a password in a `['password', '…']` pair and a credential in a URL query string.

The closing `"` sits between `Authorization` and `:`, so the shape never matches a JSON object, a header map with quoted keys, `headers['Authorization'] = …` or `setRequestHeader('Authorization', …)`. These are the common forms, not edge cases. The value had no vendor prefix either (`QB-USER-TOKEN` was not in the list), so no other shape caught it. The commented-out line is the same shape and was missed the same way.

## What to do

- **Test recall, not only precision.** Keep a labelled positive set in the shapes the code really uses: quoted keys, header maps (`N/https`, `nlapiRequestURL`), `setRequestHeader`, index assignment, concatenation onto the scheme (`'Basic ' + '…'`), template literals, comments, JSON, `.properties`. A pattern set measured only on unlabelled data proves nothing about what it finds. `tests/unit/mcp/sourceCredentialRedaction.test.ts` is the set.
- **Make each rule load-bearing.** Give every rule one fixture that only it finds, and assert the fixture leaks when that rule is removed; the same test asserts every rule has a fixture.
- **Accept the key quoted or bare.** Allow an optional quote or `]` between the name and the separator, and `,` as a separator only when the key was quoted.
- **Redact the value after the scheme, not the scheme.** `"Authorization": "QB-USER-TOKEN [redacted-credential:…]"` keeps the code readable and still withholds the value.
- **Gate on the value, not the name.** A name beside a value is not enough (`TOKEN_PARAM = 'custscript_qb_user_token'` is an id); require the value to look like a secret (length, a digit, no spaces, not a NetSuite id or a placeholder).
- **Before trusting a redactor, run it against the stored corpus and count what it finds.** Zero findings on a large real corpus is a reason to doubt the patterns, not to trust them.
