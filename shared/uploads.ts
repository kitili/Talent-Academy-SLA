/**
 * Files Trainers upload straight from the browser to Vercel Blob. Vercel cuts a function's request and response bodies
 * at about 4.5 MB, so anything larger (every video) has to skip the server on the way in and on the way out.
 */

/** The largest single upload: a long recorded session. */
export const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

/** What a lesson may be: documents, slides, images, audio and video. */
export const UPLOAD_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/*",
  "audio/*",
  "video/*",
];

/** True only for a file in a Vercel Blob store, so the server never fetches an address someone typed. */
export function isBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Videos play from where they are stored; anything else is opened through the server's viewers. */
export function isVideoName(name: string) {
  return /\.(mp4|webm|mov)$/i.test(name);
}
