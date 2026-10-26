# An SDK enum is a snapshot, not the provider's catalog

**Scope:** transferable
**Where:** `@schematichq/schematic-typescript-node` `WebhookRequestType`, and
`src/utils/agent-billing/autoTopupSuccess.ts`, 2026-09-25.

## What happened

Agent Billing needed to email customers when an automatic credit top-up
succeeded. The question was whether the provider publishes such an event. The
check looked authoritative: read `WebhookRequestType` in the installed SDK, which
declares the whole catalog as a closed TypeScript union. It listed 40 events, two
of them about auto top-up, **both failures**:

```
AutoTopupHardFailure    "auto.topup.hard.failure"
AutoTopupRetryExceeded  "auto.topup.retry.exceeded"
```

That was written up as settled — "there is no auto-top-up success event *in the
provider's event catalog at all*" — and a design was built around inferring a
success from Stripe instead, which required guessing whether a charge was
automatic from a metadata flag that turns out not to mean that.

The event existed. The installed SDK was **1.5.4**; `auto.topup.success` is
present in **1.6.2**, along with `credit.purchase.success`. Querying the live
account's webhook configuration showed **41** subscribed event types including
both. The catalog had grown; the pinned dependency had not.

## Why it is a trap

- A closed union of string literals *reads* as a specification. It looks like the
  provider telling you what exists, when it is a code generator's snapshot of
  what existed on the day that version was cut.
- The negative is the dangerous direction. Finding an event in the enum proves it
  exists; NOT finding one proves only that your version predates it. The check
  feels equally conclusive both ways, and is not.
- Corroborating evidence agreed, and was also stale: no such event appeared in
  the account's delivered history — because nothing had subscribed to it yet.
  Two sources agreeing can be one source counted twice.
- The wrong conclusion was expensive in the right-looking way. It did not fail
  loudly; it produced a plausible alternative design — infer the success from
  Stripe — which then had to guess whether a charge was automatic. The
  obvious-looking signal there, `auto_topup: "true"` on the invoice metadata, is
  a description of the GRANT'S CONFIGURATION and reads identically on a manual
  purchase, so that design was one misreading away from telling every customer
  who bought credits by hand that their purchase was automatic. None of that
  work was needed; the provider had shipped the event.

## The rule

When concluding a provider does **not** support something, do not stop at the
installed SDK. Confirm against something that moves with the provider:

1. `npm view <pkg> versions` — is the installed version even current?
2. The **live account's own configuration**, via the provider's API. For webhooks
   that is `listWebhooks`, whose `requestTypes` is the set the account can
   actually receive.
3. The delivered-event history — but read an absence there as "nothing has
   subscribed or fired yet", never as "the provider cannot send it".

Only the second is authoritative about capability. The others are hints.

## How to check for it

`docs/agent-billing/operations.md` records that `auto.topup.success` is newer
than the installed SDK, so the next person reading `WebhookRequestType` locally
and finding it absent has the answer in front of them. The general form: when a
doc states a provider limitation, it should name **which version** the claim was
checked against, so a reader can tell a fact from an expiry date.
