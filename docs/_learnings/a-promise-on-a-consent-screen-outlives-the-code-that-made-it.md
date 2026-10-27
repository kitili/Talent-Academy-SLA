# A promise on a consent screen outlives the code that made it

**Scope:** transferable
**Area:** MCP OAuth scopes; adding rename and delete to the agent project surface, 2026-09-17

## The symptom

There is no crash here, which is the point. The request was ordinary:

```text
Are you able to update the projects to have different names?
```

The MCP connector could list and create projects but not rename or delete them,
so an agent had to tell a user to go and do it in the web app. Adding the two
missing tools looks like a morning's work — a route, a service function, a tool
definition, all with three existing examples to copy.

The trap is that `splotch:write` was already there, it already meant "this
connection may change things", and putting both new tools behind it is the
obvious move. Doing that would have been a silent, unannounced, irreversible
widening of what every existing grant was allowed to do.

## Why it was misleading

The boundary was documented in four places, and three of them read like
implementation notes a feature is expected to update:

| Where | What it said |
|---|---|
| `src/utils/mcp/oauth/accessToken.ts` | "Creation only… There is no scope that grants them." |
| `src/services/mcp/projectWrites.ts` | "No update, no delete…" |
| `workers/splotch-mcp/README.md` | "**Updating or deleting anything.** No rename, no delete…" |
| `src/app/oauth/authorize/ConsentCard.tsx` | "It cannot **delete anything**, change who has access, publish a share link, or touch your NetSuite account." |

The first three are ours to change. **The fourth is not the same kind of
sentence.** It is not a description of the code; it is the thing a person read
before pressing Allow, and it is the entire basis on which they granted anything
at all. Editing it changes what future users are told. It does nothing whatsoever
about users who already said yes to the old one.

That would not matter if a grant were a moment. It is not: OAuth grants refresh.
Access tokens carry a one-hour TTL (`MCP_ACCESS_TOKEN_TTL_SECONDS`), but the
refresh token behind them keeps minting new ones with the same scope set, for as
long as nobody revokes it. So "every existing `splotch:write` grant" is not a
backlog that drains in an hour — it is a standing population of connections whose
users were told, in writing, that deletion was impossible.

Fold delete into `splotch:write` and every one of them can delete projects
tomorrow, having never been asked, with no screen at which they could have said
no. Nothing fails. Nothing logs. The first sign is a project that is gone.

## The rule

**A scope is a promise to a person, not a permission bit.** Before widening what
an existing scope grants, find the sentence the user read when they granted it.
If the new power contradicts that sentence, the scope cannot carry it — not
because of a policy, but because there is no moment left at which the person can
decline.

A new scope is what manufactures that moment. Nobody holds `splotch:delete`, so
every connection is refused until its user returns through consent and reads a
screen that names destruction. The cost is one extra re-authorization for people
who want the feature. The alternative has no cost to us at all, which is exactly
why it is the tempting one.

The same test applies to a widening that looks harmless. Renaming went onto
`splotch:write` here, and that is a real change to what existing grants may do —
it was acceptable only because the consent sentence prohibited *deleting*, and a
rename is reversible and destroys nothing. That is a judgement about a specific
sentence, not a general licence to widen.

## The check

Before changing what a scope grants:

1. `grep -rn "<scope name>" src/app/oauth/` — find the consent copy, not just the
   constant. The copy is the contract.
2. Read the sentence as a user who granted six months ago. Does the new power
   contradict it?
3. If it does, add a scope. If it does not, still update the copy — and say in
   the scope's own doc comment what the new sentence is, so the next person finds
   it in step 1.

## Since then

**2026-09-18.** The card's body now scrolls inside the card, so any block in it
can be below the card's own fold while Allow is in view. The heading sentence
is pinned, which makes it the one surface a person is guaranteed to have seen
at the moment of approval. It is built by `describeConsentRequest` in
`src/utils/mcp/oauth/consent.ts` from every reach the request asks for — the
NetSuite configuration read had only its block before — and
`tests/unit/mcp/oauthConsent.test.ts` checks all sixteen scope combinations.
"All three surfaces" now reads: all three surfaces, and the heading is the one
that is always visible. A new scope that gets a block and no heading entry is
the failure that test exists for.

## Two smaller traps found on the way

**`resolveCanvasScope` is not the authorization helper it looks like.** Every MCP
read tool resolves a canvas through it, so reaching for it in a new project route
is automatic. It requires an ingested repository and answers `no-code` 404
without one. For a system-map question that is right; for rename and delete it
refuses exactly the case they exist for — the empty, half-created project
somebody wants to name properly or throw away. The organization boundary is the
part worth sharing (`isOrgMember`); the repository requirement is not.

**A static import of a `server-only` module makes a whole service file
untestable.** `dotsonV2StrictWriterGuard.server` pulls in `server-only`, which
the node test runner cannot resolve, so importing it at the top of
`src/services/mcp/projectWrites.ts` broke every pre-existing test of the
*creates* — code that had not changed. The fix is `await import()` at the point
of use, which `enqueueProjectDeleteJob` already does for `@/utils/queue`. The
failure names the package rather than the design mistake, so it reads as a
toolchain problem.

Designed out 2026-09-20: `dotsonV2StrictWriterGuard.server` and its import in
`projectWrites.ts` were removed with the DotSON V2 layer
(`plans/drivetrain/dotson-v2-deprecation-plan.md`). The trap stands for any
`server-only` module imported statically into a service file that node tests
load.
