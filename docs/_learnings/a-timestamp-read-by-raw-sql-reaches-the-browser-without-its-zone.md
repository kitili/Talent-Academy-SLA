# A timestamp read by raw SQL reaches the browser without its zone

**Scope:** this repository
**Area:** any route that sends rows from `db.execute(sql\`…\`)` to a page; found on `/api/teacher/events`, `/api/teacher/assignments` and the marking list (`server/storage.ts`)

## The symptom

A Fellow in Dar es Salaam saw every session three hours early, and a session that was on right now was missing from
Home's Coming up, with no Join button. Work whose deadline was hours away would have vanished from Work early.

## Why it was misleading

The same session showed the right time on Calendar → Timetable and on the Trainer's pages. The stored value was right;
the tests on the server, which runs in UTC, passed.

## Why it happens

The app's `timestamp` columns have no time zone and hold UTC. A Drizzle `select` turns them into `Date` objects, which JSON
sends as `…Z`. Raw SQL through `db.execute` returns the column as text with no zone, `2026-10-29 13:46:08.395`. A browser
reads zone-less text in its own zone, so in UTC+3 every time moves three hours. The server, in UTC, reads the same text
correctly, so only the page is wrong.

## The check

Prefer a Drizzle `select` for rows a page reads. When a query must stay raw, pass its timestamp columns through
`utcTimestamps(rows, [...])` in `server/storage.ts`, which marks them as UTC. To catch it, run the page in a browser in a
zone other than UTC; a server-side test in UTC cannot see it. Other raw-SQL routes in the app were not audited.
