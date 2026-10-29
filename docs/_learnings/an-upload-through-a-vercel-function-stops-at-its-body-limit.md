# An upload through a Vercel function stops at the function's body limit

**Scope:** this repository
**Area:** lesson file uploads (`client/src/components/ObjectUploader.tsx`, `PUT /api/local-objects/:id`, `server/objectStorage.ts`) and file viewing (`/api/files/proxy`)

## The symptom

A Trainer uploads a recorded session to a module on the live site and it fails, though the same file uploads on a
laptop running `npm run dev`. Small slides and PDFs upload fine everywhere.

## Why it was misleading

The Express route says `express.raw({ limit: "80mb" })` and the uploader allows 50 MB, so the code reads as if anything
under 50 MB works. Local runs agree, because a local Node server has no platform limit.

## Why it happens

On Vercel every `/api/*` request runs in one function (`api/index.ts`), and Vercel cuts a function's request and response
bodies at about 4.5 MB, before Express sees them. The old path sends the whole file through that function on the way in
(`PUT /api/local-objects/:id`, then `put()` to Blob) and again on the way out (`/api/files/proxy` reads the file into the
function and sends it back). Any limit written in the app is beside the point above 4.5 MB.

## The check

A file that may be larger than a few MB must not pass through the function. Since 2026-10-29, with `BLOB_READ_WRITE_TOKEN`
set, the browser uploads straight to Vercel Blob (`@vercel/blob/client` `upload()`, signed by `POST /api/blob-upload`) and a
video in Blob plays from its Blob URL. Documents still open through the proxy, so a very large PDF or deck would still hit
the limit there. Files uploaded before that date live at `/objects/local/<id>` and are still read through the function.
