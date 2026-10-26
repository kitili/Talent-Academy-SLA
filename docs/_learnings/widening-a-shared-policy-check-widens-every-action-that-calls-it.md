# Widening a shared policy check widens every action that calls it

**Scope:** transferable
**Area:** authorization helpers called by several routes; here `src/utils/netsuite/connectionAccess.ts`.
**Status:** designed out for the connection policy on 2026-10-11 (systems task T7): the role bar is now chosen by
the caller (`use: 'manage' | 'new-system'`), and a test lists which callers pass the wider one.

## The symptom

A decision said: anyone who can create a project may now see the organization's NetSuite connections in
onboarding (systems plan D1). The plan located the rule precisely: "listed only to owners and admins
(`connectionAccess.ts:304-317`)", and the brief said to widen exactly that.

## Why it was misleading

The cited lines are the role check of `getReusableNetSuiteConnectionAccessSourceForCanvas`. Changing them looks like
changing "who can list connections". It is not: the same function also answers ingestion start
(`loadReusableNetSuiteConnectionForCanvas` in `startNetSuiteIngestion.ts`), Config Repair start, runtime extraction,
the refresh bootstrap and the agent context search. Widening the check there would have let a plain member refresh
a system and run Config Repair, both of which the same decision record keeps owner/admin (SD7). No test would have
failed: every existing test asserts that owners and admins pass, and members were refused only in the listing tests,
which the change was meant to update.

## Why it happens

A helper named for one action ("reusable connection for canvas") is the rule for every action that needs a
connection, because each route reached for the nearest helper. The name describes its first caller, not its
reach. A plan that cites a line range describes where the rule is written, not who reads it.

## The rule

Before widening a check, grep its callers (`grep -rn "<function>(" src workers`) and list the actions each one
gates. If only some should widen, make the bar a parameter the caller chooses, default it to today's, and pin
which callers pass the wider value with a test that reads them. Never widen the default.

## Related

- `one-rule-many-layers.md`, `clearing-one-layer-of-a-rule-is-not-clearing-the-rule.md` (the same rule in several
  places; this is the converse: one place serving several rules).
- `tests/unit/netsuite-ingestion/netsuiteConnectionAccess.test.ts` ("only the onboarding surfaces pass use:
  'new-system'").
