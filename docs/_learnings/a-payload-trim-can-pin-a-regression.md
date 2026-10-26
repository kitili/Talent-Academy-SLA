# A payload trim can pin a regression

**Scope:** transferable

## Symptom

Workstream cards on the project page showed a title, a status and "Created 22
hours ago", but not who started the workstream. The agent panel's chat history
always showed the author; workstreams stopped showing one when they moved to a
list of their own.

## Why it was misleading

It looked like a missing feature rather than a regression, and one test made it
look intentional. `tests/unit/workstream-actions/workstream-list-latency.test.ts`
asserted that `created_by_user_id` must **not** be in `WORKSTREAM_LIST_COLUMNS`,
with the message "is back in the list payload and nothing renders it". That was
true when it was written, *because* the author had already been dropped. The
payload trim turned the regression into a rule the suite enforced, so adding the
author back looked like it broke a performance guard.

The author was never a column the old list read directly anyway. It came from a
server-side enrichment step (`fetchCreators` in `src/app/api/agent-chats/route.ts`)
that turned `created_by_user_id` into a name and avatar. Moving the rows to a
new route kept the columns in view and lost the enrichment, which a diff of
column lists does not show.

## The check

- When rows move from one list surface to another, compare what the **old
  response** carried, not just what the old query selected. Enriched fields such
  as `created_by_name`, `splotch_name` and `is_mine` are added after the select.
- When a test says a field is excluded because "nothing renders it", ask whether
  anything *should*. An exclusion list documents current usage, not intent.

## Evidence

- Fix: the lookup moved to `src/utils/agent-chats/chat-creators.ts` and is now
  shared by `/api/agent-chats` and `/api/projects/[projectId]/workstreams`.
- The latency test now asserts `created_by_user_id` **is** listed, with the
  reason.
