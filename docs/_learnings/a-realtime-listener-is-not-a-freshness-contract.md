# A realtime listener is not a freshness contract

**Scope:** transferable
**Area:** removing a member from an organization, 2026-10-02
(`docs/organization-actions/architecture.md`, "What the removed user sees")
**Status:** fixed on 2026-10-02 (`fix/org-update-on-user-removal`)

## The symptom

When an admin removed a member in prod, the removed user, whose tab was already open, kept seeing the
organization in the org switcher and stayed on its project list. Their API calls were already being
refused. Every organization route re-reads `organization_membership`, and nothing caches membership
on the server. So the access had gone, and only the UI still showed it.

## Why it was misleading

The code looked complete. `useUserOrganizationRealtime` handled the membership DELETE: it dropped
the organization from the cached list, removed its detail query and redirected out of it.
`docs/realtime-notifications/operations.md` said the switcher updates when the user "loses access
to an organization". Reading only the handler, you would conclude the feature works and the problem
must be a missing publication in prod.

In fact the event was the only path, and it could be lost in three ways:

- **The subscription resubscribed on every navigation.** Its effect listed `pathname` as a
  dependency, because the handler compared the path. Each route change tore the channel down
  (`removeChannel`, not awaited) and joined a new one on the same topic. An event that landed in that
  gap was gone.
- **Postgres Changes are not replayed.** After a dropped socket or a sleeping tab, the channel
  rejoins without the events it missed, and nothing refetched to catch up.
- **The fallback was too slow.** The list (`['organizations']`) had a 10-minute stale time and is
  persisted to IndexedDB. With the event missed, nothing refetched for 10 minutes, and a reload
  repainted the persisted list. `/` then redirected into `organizations[0]` from that cached list,
  which could send the user straight back into the organization they had lost.

## The check

For any state that must change when *another* user acts, ask what corrects it if the event never
arrives:

- Does an effect that owns a subscription list anything that changes per page, such as `pathname`,
  route params or a callback rebuilt each render? `grep -n "}, \[" <hook>` and read the deps. Read
  values through a ref instead.
- Does the subscriber do anything on `SUBSCRIBED`? The first join and every rejoin should refetch
  whatever the events would have patched.
- What is the query's `staleTime`, and is it persisted (`docs/caching/README.md`)? A persisted query
  with a long stale time paints old data on reload and does not ask.
- Does any redirect choose its target from cached data before a refetch confirms it?

## Fix (2026-10-02)

- The hook reads the path through a ref, so it keeps one channel per session.
- It refetches the organization list on every `SUBSCRIBED` (`onStatus` on
  `subscribeToSupabasePostgresChanges`).
- The list always revalidates.
- `/` redirects only from a refetched list.
- `watchOrganizationAccessLoss` (`src/utils/organizations/accessLoss.ts`) handles a lost
  organization once, whether the event or a refetch reported it first. Tested in
  `tests/unit/organization-actions/accessLoss.test.ts`, with the wiring pinned by
  `tests/integration/realtime-notifications/userOrganizationRealtimeWiring.test.ts`.

No other hook under `src/hooks/realtime/` reads `pathname` (checked 2026-10-02).
