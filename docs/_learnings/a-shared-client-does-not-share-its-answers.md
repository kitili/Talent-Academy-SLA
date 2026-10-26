# A shared client does not share its answers

**Scope:** transferable
**Area:** browser auth reads (`supabase.auth.getUser()`), any SDK "who am I" call made from several hooks; `src/utils/supabase/currentUser.ts`.
**Status:** designed out for the browser on 2026-10-10 by `getCurrentUser()` (`plans/performance/auth-call-consolidation-plan.md`, task T1).

## The symptom

A signed-in hard load of the project overview made 5 or 6 browser requests to `https://<project>.supabase.co/auth/v1/user`, 0.3–0.5 s each, and they ran one after another: the 4th took 9116–9407 ms and the 5th 9409–9844 ms of the navigation, each starting as the previous one finished (measured 2026-10-10). The settings cog and the landing project list waited behind them.

## Why it was misleading

`createClient()` in the browser returns one cached client (`@supabase/ssr` `createBrowserClient` keeps a singleton), so "every hook uses the same client" reads as "the user is fetched once". It is not. The client is shared; its answers are not. Six hooks each calling `getUser()` in their own mount effect are six network calls. And because they look independent, nobody expects them to queue.

## Why it happens

- `getUser()` asks the Auth server every time; only `getSession()` reads local state.
- auth-js 2.65.1 runs `getUser()` inside the client's auth lock for the whole round trip (`GoTrueClient.js:850-858`, `_acquireLock(-1, () => this._getUser())`). `getSession()` takes the same lock (`:703-711`), and so does every browser PostgREST query, because `fetchWithAuth` reads the token through `getSession()` (`SupabaseClient.js:174-184`). N concurrent callers make N serial round trips, and a data query issued meanwhile waits behind all of them.

## What to do

- Ask once per document: hold one module-scope promise (single flight), hand later callers the cached result, and do not cache errors or null results.
- Invalidate on the client's own auth events: clear on `SIGNED_OUT`, replace on a different user, keep on `TOKEN_REFRESHED`. A read that was in flight when the identity changed must be asked again, not cached, or the previous user survives the sign-out.
- auth-js emits `SIGNED_IN` from storage while it initializes, before the first validated read returns. Do not let that unvalidated copy replace the in-flight read.
- If components read the cached user on their first render, read it through `useSyncExternalStore` with a null server snapshot. A `useState(cachedUser)` initialiser mismatches hydration once the read resolves before React hydrates, which an early prime makes likely.
- Count it where it costs: the network. `tests/browser-fixtures/auth-call-budget.spec.ts` counts `GET /auth/v1/user` per screen load, and the contract test fails on any new direct browser caller.
