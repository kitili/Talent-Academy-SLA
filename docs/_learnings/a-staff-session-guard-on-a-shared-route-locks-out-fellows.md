# A staff session guard on a shared route locks out Fellows

**Scope:** this repository
**Area:** `server/routes.ts`, `server/teacherAuth.ts`, `isAuthenticated` against `isAuthenticatedAny`
**Status:** fixed for `GET /api/certificates/:certId` on 2026-11-06

## The symptom

A Fellow pressed **View** on their certificate and saw "Certificate Not Found". The certificate existed, and `teacherRecordAllowed` would have let them read it.

## Why it was misleading

The route had a Fellow rule inside it, so it looked built for Fellows, and the screen reported a missing record instead of a refused session.

## Why it happens

A Fellow's session is `req.session.teacherId`, not a passport login, so `isAuthenticated` answers 401 before the handler's own rule runs. The client turns any failure into "not found".

## How to avoid it

A route a Fellow reads uses `isAuthenticatedAny` or `isTeacherAuthenticated`, with its own rule inside. When a new Fellow screen calls an existing route, read its guard, and test it through a Fellow's session.
