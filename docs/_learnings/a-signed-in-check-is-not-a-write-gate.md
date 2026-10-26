# A signed-in check is not a write gate

**Scope:** transferable
**Area:** API write routes over a service-role client; found in `POST /api/scripts`, 2026-09-29. **Status:** that route fixed (`authorizeProcessSourceWrites`), then **deleted on 2026-10-03** with the foreground ingestion pipeline, its only caller (`saveScripts.ts`, `processWriteAccess.ts` and `scriptWriteAuthorization.test.ts` went with it; the paths below are historical). The trap stands for every other write route. **Extended 2026-10-03** with the same shape on read routes that had no check at all, and a body credential that was never compared (see the last section). The eight sibling routes of the same sweep fixed the same day (see "Status of the sweep" below); open decisions listed there.

## The symptom

There was none. `POST /api/scripts` did this:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return 401
const supabaseServiceRole = createAdminClient()
// ...read processes, then UPDATE scripts.script_content / INSERT scripts
//    for whatever process_id values the body names
```

Any signed-in user of any organization who knew a process UUID could overwrite
another organization's stored script source, the text the Map's Code pane shows
and the Build pipeline reads. Nothing failed, because every legitimate call
passes a check that only asks "is someone signed in?".

## Why it was misleading

- **The file looked gated.** The `GET` handler in the same `route.ts` calls
  `resolveProcessRequestAuth` for every requested process, and a source-contract
  test (`scriptSourceAuthorization.integration.test.ts`) is named "script source
  routes authorize every requested process". It pins `GET` and the batch read;
  nothing named `POST`.
- **The step before it is gated.** The route is documented as "called AFTER
  processes are created", and the route that creates them
  (`save-code-processes`) checks `canIngestCode`. That reads as a chain, but each
  request is independently addressable: the second call inherits nothing from
  the first.
- **`createClient` sounds like the user's client.** In
  `src/utils/supabase/server.ts` it is service-role with cookies attached so
  `getUser()` can name the caller (see
  `a-401-can-mean-the-route-never-looked.md`). No RLS stands behind either
  client, so the route's own code is the only authorization there is.
- **`getUser()` is the right first line.** It is authentication and it is
  correct. The gap is the absence of a second line, which no diff shows.

## The check

For any `POST`/`PUT`/`PATCH`/`DELETE` that writes through `createAdminClient()`
or the server `createClient()`:

1. List the ids the write is keyed on that come from the request (body, query,
   path).
2. For each, find the call that ties it to the caller: `getCanvasPermissions` +
   a `can*` helper, `assertProcessAccess` / `resolveProcessRequestAuth`,
   an `organization_membership` comparison, or `.eq('user_id', user.id)` on the
   written rows. If the only thing between the request and the write is
   `getUser()`, it is open.
3. For a batch, check that every id is authorized, not the first one.
4. Write the refusal test against the handler with the rows in memory, and
   assert the foreign row is unchanged. Then delete the check and watch the test
   fail (see `a-refusal-test-that-passes-when-the-refusal-is-gone.md`).

A first pass is a grep: route files containing `auth.getUser` and `.insert(` /
`.update(` / `.upsert(` / `.delete(` but none of `getCanvasPermissions`,
`assertProcessAccess`, `resolveProcessRequestAuth`, `organization_membership`,
`user.id)`. Read what is left.

## The fix, and its bar

`src/utils/netsuite/processWriteAccess.ts` resolves every distinct process in
one query and checks each distinct canvas with `getCanvasPermissions` +
`canIngestCode`, the bar `save-code-processes` set for creating those
processes. Read access is not enough: any organization member of a
company-space project can read it. A foreign or missing process is `404` (one
answer for both); a same-organization viewer is `403 NO_INGEST_PERMISSION`. The
handler body moved to `src/app/api/scripts/saveScripts.ts` so
`tests/unit/code-ingestion/scriptWriteAuthorization.test.ts` drives it with
injected clients; its four refusal cases fail with the permission check removed.

## Evidence

- Only caller of `POST /api/scripts`: `src/components/canvas/AddFromLinkModal.tsx`
  (cookie session, after `save-code-processes`). Background jobs write `scripts`
  through `persistIngestionRepository()`; the harness only `GET`s.
- The same sweep (2026-09-29, 57 write routes that call `getUser()`) found the
  shape again, and two routes with no authentication at all. Their status is
  below.

## Status of the sweep

Fixed 2026-09-29 on `security/unauthenticated-write-routes`. Every handler body
now takes its clients as arguments and is driven by a unit test over in-memory
rows (`tests/fixtures/supabase/inMemorySupabase.ts`); each refusal test was run
with its check deleted and failed.

| Route | Was | Now |
| --- | --- | --- |
| `canvas/invites` GET/POST/DELETE (legacy guest list) | No authentication. POST wrote a `SENT` row with a caller-chosen token and name and set `shared = true`; the project-role accept route grants the role in the name (`"Me\|editor"`), so anyone could make themselves an editor on any project. | Session required. GET: any project role. POST/DELETE: `canManageGuests` **and** `canAccessProjectSettings` (they write `shared`). A name containing `\|` is refused. Foreign or missing project `404`, same-org role `403`. `legacyGuestInvites.ts`. |
| `provisional/migrate` PUT, and `provisional` POST/DELETE | No authentication. Reassigned any provisional user's canvases to any user id; POST returned a provisional user, Fireflies API key included, for any email; DELETE deleted any provisional user. | Routes **deleted**. Their only callers (signup, Google sign-in) fetched them server-to-server; they now call `migrateProvisionalAccount` in-process with the user id and email from their own auth result. |
| `invitations/revoke` POST | Any signed-in user revoked any invitation by id. | Invitation resolved first. Project invitation: `canManageGuests` on its project; organization invitation: owner/admin of its organization. Foreign or missing `404`, role `403`. No UI caller. |
| `organizations/[orgId]/icon/cache-brandfetch` POST | Wrote any organization's icon. | Owner, admin or member of that organization; invitee `403`; no relationship `404`. |
| `canvas` POST and `projects` POST | `space_id` written as sent (the `projects` route had the same gap). | `authorizeProjectSpace`: the space must belong to the project's organization (`404 SPACE_NOT_FOUND`), and a personal space must be the caller's (`403 SPACE_NOT_ALLOWED`). |
| `document-templates` GET/POST | Listed and uploaded into the template library of any `canvasId`'s organization. | Any role on that project (`canViewProject`); otherwise `404 Canvas not found`. |
| `background-document-generation/start` POST | No permission check; staged other tenants' templates, NetSuite configs, code quality and job-bucket objects. | Canvas: any project role. Template: visible under the templates-list rule. Code: must be the project's (`code.canvas_id`). Upload paths: under `<userId>/<jobId>/uploads/`, which `upload-urls` now mints. Any other: `404`. |
| `canvas/splotches` POST `clone_from_id` | Destination checked, source read by id alone. | The source is read only through `loadAuthorizedCloneSource`, which requires a role on the source's project; otherwise `404`. |

Still open (decisions, not defects this pass could settle):

1. **Template library bar.** Any project role, an External collaborator with an
   explicit role included, can list the whole organization library and add to
   it. Recommended: listing for anyone who can open the wizard; upload for the
   Editor tier (`canEditSplotches`), since an upload is shared with the whole
   organization.
2. **Provisional migration before email confirmation.** Email/password signup
   migrates the provisional user with the typed email before that email is
   confirmed (it always did). The canvases go to an account only the address's
   owner can activate, but the Fireflies key moves at once. Recommended: migrate
   on the first confirmed sign-in instead. Also unchanged: deleting a
   provisional user that `fireflies_api_keys` still references fails on the
   foreign key and is only logged.
3. **An invitation row does not say who created it.** `invitations` has no
   creator column, so `canvas-invitations/accept` cannot check that a `SENT` row
   came from someone allowed to send it; every writer of the table is part of
   the accept gate (`canvases/[canvasId]/invitations`, `canvas/invites`, and
   `copyProjectPermissions` on clone). Recommended: an `invited_by` column
   written by both routes and checked on accept.
4. **Organization icon cache bar.** Set to membership (not owner/admin like a
   custom icon upload) because the image is derived from the organization's own
   domain and only fills an empty icon. Confirm with product.
5. **`POST /api/invite`** still sends a Splotch-branded email with no session
   (roles-and-permissions Known Gap 2). Out of this pass: it writes no rows.

## A second trap: a route only the server calls is still a public route

`provisional` and `provisional/migrate` had no authentication because their
callers were server code (`/api/auth/signup`, `googleSignIn`) that fetched them
against the app's own public URL. The author's mental model was "an internal
step"; the deployment's was "a public endpoint". When a route exists only to
be called by other server code, call the function instead of the URL.

## The same shape with no check at all, and a credential that proves nothing (2026-10-03)

`GET /api/fireflies/meetings-stored` and `meeting-topics` began with a comment
that reads like a safeguard:

```ts
// Use admin client (cookie-less) to bypass RLS
const supabase = createAdminClient()
const userId = req.nextUrl.searchParams.get('userId')
```

There was no `getUser()` at all, so the user id in the URL was the only
"authorization", and anyone could read any user's meetings, or make the server
use that user's stored Fireflies key. The traps:

- **A user id is not a secret.** It felt unguessable, but
  `POST /api/gdocs-plugin/signup` returned the user id of any registered email,
  so an email was enough. Treat every id in a request as known to the attacker.
- **"Bypass RLS" names the risk, not a control.** The comment explains why the
  route works, and reads like a decision someone reviewed.
- **A credential in the body is not an identity until it is compared.**
  `POST /api/fireflies/poll` took `userId` and `apiKey` and used the key only
  to call Fireflies. Anyone's own Fireflies key plus a victim's id wrote
  splotches into the victim's project. The fix compares the key with the user's
  stored active key (`pollFireflies.ts`), the row the cron already sends.
- **A read keyed on a project id needs the resolver too.** `GET /api/ingestion/credit-check` checked only that someone was signed in, then read with the service-role client, so any signed-in user could read any project's organization name and credit balance. Fixed 2026-10-04 with `authorizeCanvasAccess(..., canViewProject)` before the first read (`checkIngestionCredits.ts`).
- **An email in the body is not a session.** `POST /api/fireflies/unsubscribe`
  deleted the Fireflies project of whichever account owned the posted email.

The check for reads: grep route files using `createAdminClient` /
`createClientServiceRole` for `searchParams.get('userId'` or a body `userId` /
`user_id` / `email`, and confirm the id is compared with the session user (or a
stored secret) before the first query. The fixed routes and the routes the
2026-10-03 sweep left open are listed in
`plans/security/meeting-content-exposure-hotfix-plan.md`.
