# A column no code writes is not a signal

**Scope:** transferable
**Area:** MCP entitlement (`src/utils/mcp/entitlement.ts`); `subscriptions`, 2026-09-25 (SPL-4272)

## The symptom

The first live run of the new MCP entitlement gate refused Splotch's own
organization:

```text
Your organization's Splotch subscription has lapsed. Renew it to use Splotch here again.
```

The organization was plainly not lapsed. Its row:

| subscription_plan | subscription_status | end_date | stripe_subscription_id |
|---|---|---|---|
| FULL_ACCESS | active | 2025-12-26 09:26:26 | null |

## Why it was misleading

"Lapse = status says so, or `end_date` has passed" is the rule anyone would
write, and it was the rule agreed before any code. `subscriptions.end_date` is a
real column with a real-sounding name, typed as a timestamp and exported in the
generated types.

Nothing writes it. Every writer (the Stripe webhook's invoice handler, signup,
Google sign-in) has its `end_date` line commented out, and the app reads it
nowhere that decides anything. The only values in it were set by hand or by code
that is long gone. This one had the same time of day as the row's `created_at`,
to the second, so it was a generated default, not a contract end. It had "expired"
nine months earlier, and nobody noticed, because nothing looked.

A unit test cannot catch this. The rule was implemented correctly; the column
did not mean what its name says.

## The rule

Before a new gate reads a column as evidence, find its **writers**, not its
readers: grep for the column in insert/update/upsert calls and in `migrations/`.
If nothing maintains it, it is not a signal, whatever it is called. Then run the
gate once against real rows before shipping. The Stage 0 queries in
`plans/mcp/mcp-subscription-entitlement-plan.md` exist for exactly this.

Two things made the run cheap here, and one of them is its own trap: `yarn dev`
on `qa` reads the **production** database (`BRANCH_DATABASE_ENVIRONMENT`). That
is why the refusal showed up at all, and it is also why nobody should edit
billing rows "to test a refusal locally".

**Status:** designed out for MCP. `end_date` is not read, and the entitlement
module's header says why. The column is still unmaintained, so the trap stays live
for any other reader.
