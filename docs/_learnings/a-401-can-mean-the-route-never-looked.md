# A 401 can mean the route never looked at your credential

**Scope:** transferable
**Area:** agent-to-app authentication; canvas read routes, 2026-09-14

## The symptom

A drivetrain build stopped mid-assessment. The agent reported:

```text
my call to read the project overview was rejected with HTTP 401 — Unauthorized:
the signed-in session is not being accepted. Per protocol I won't retry it.
```

and asked to be signed in again. Oddly, the `impact-context` fetch moments
earlier had succeeded.

Signing in again would have changed nothing. The session was fine — verified by
calling the same three routes from the browser, all `200`.

## Why it was misleading

`401 Unauthorized` reads as a statement about the caller: your credential is
missing, expired, or insufficient. Here it was a statement about the **route**.

`/api/canvases/[canvasId]/overview` authenticated like this:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

`getUser()` reads a Supabase auth **cookie**. The agent harness is not a
browser and has no such cookie — it holds a build-session bearer token. Nothing
on the route ever read the `Authorization` header, so there was no session to
find and no path by which the credential it did hold could be considered.

The 401 therefore meant *"this route has no code path for the credential you
carry"* — indistinguishable, from the outside, from *"your session expired"*.
The agent's reading was the reasonable one, and it was wrong.

The partial success is what makes it convincing: `/api/processes/...` routes go
through `resolveProcessRequestAuth`, which accepts cookie **or** bearer. Canvas
routes were never given the equivalent. So the same caller, in the same run, is
authenticated on one route and rejected on another — which looks exactly like a
session expiring mid-run.

## The check

When a 401 is puzzling, ask what the route reads before asking what the caller
sent:

```bash
grep -n "auth.getUser\|readBearerToken\|resolveProcessRequestAuth\|Authorization" <route>
```

A route with `getUser()` and no bearer path can only ever answer a cookie
caller. Confirm the credential is live independently — call the same route from
a browser session, or check the token row — before concluding anything about
the caller.

The generalisable form: **a failing auth check proves the route rejected you, not
that your credential is bad.** Those are different claims, and only the second
one is fixed by signing in again.

## The trap underneath

This route was built *for* the agent. Its own documentation says so:

> The splotch list is the agent's half of this route … `manage-project`'s skill
> documents this as the one call that returns a project and everything in it.

An endpoint can be designed for a caller, documented for that caller, and called
by that caller, while never having been given that caller's way of
authenticating. The skill documentation and the route's auth were written by
different hands and nothing compared them.

**Every** canvas route was cookie-only when this was found — seven of them
documented for agent use.

## The fix, and its boundary

`src/utils/auth/canvasRequestAuth.ts` accepts either credential for the two
read routes a Build actually needs (`overview`, `system-map`). It refuses a
token scoped to a different canvas, and refuses an agent request arriving
without a token rather than falling back to whatever cookie it carried.

What it deliberately does **not** do is authorize. These routes bypass RLS —
their client is service-role — and make an explicit organization-membership
check. Supplying a user id was the whole fix precisely because authentication
and authorization were already separate; the membership check still gates the
bearer caller exactly as it gates a cookie one.

The membership, permission, invitation, section, clone, transfer, and
batch-permission routes stay cookie-only. A build-session token is minted for
one Build and must not become a way to change who can reach a project. The
boundary is pinned by test rather than left to judgement, in both directions:
`tests/unit/auth/canvasRequestAuth.test.ts`.

## A smaller trap met on the way

`createClient` is **not** a cookie-scoped client. It is
`createServerClient(url, serviceRoleKey, { cookies })` — service-role for data,
cookies only so `getUser()` can name the caller. Reading it as "the user's
client" is how a route ends up believing RLS is protecting it. Once
authentication moved out, the cookie plumbing was dead weight and the name
implied a scoping that never existed, so both routes now use
`createAdminClient()` and say what they are.

## Evidence

Build `build_aea529e3-a792-469e-a806-4240889c1224` on splotch
`639a0b74-f303-4208-be0d-8c86f0c74bb4`. The same call failed silently in the
preceding run (`"Getting system map summary — failed"`) and the agent continued;
this time it failed closed and stopped, which is the safer behaviour and is what
finally made the gap visible.
