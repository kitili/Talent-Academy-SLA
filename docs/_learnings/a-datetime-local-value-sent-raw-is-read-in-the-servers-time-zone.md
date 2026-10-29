# A datetime-local value sent as typed is read in the server's time zone

**Scope:** transferable
**Area:** any form that posts `<input type="datetime-local">` to a server; here the Trainer's "Add a session" dialog (`client/src/pages/trainer-batches.tsx`) and `POST /api/batches/:batchId/events`

## The symptom

A Trainer in Dar es Salaam schedules a session for 09:00. Fellows see it at 12:00.

## Why it was misleading

The saved value looks right in the database and the page formats it correctly. Nothing is wrong with either end on its own.

## Why it happens

`datetime-local` has no zone: it posts `2027-03-05T09:00`. The server runs `new Date("2027-03-05T09:00")`, and a string
with no zone is read in the **server's** zone (UTC on Vercel). Every reader then converts that instant into their own
zone, three hours off.

## The check

Convert on the client, where the zone is known, and send an instant: `new Date(value).toISOString()`. The server should
refuse a date it cannot read instead of storing `Invalid Date`. Date-only values (the academy year) are all-day: store
them as UTC midnight and print them with `timeZone: "UTC"`.
