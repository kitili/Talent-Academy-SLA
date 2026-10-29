import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { JOIN_OPENS_MINUTES, SESSION_DEFAULT_MINUTES, sessionPhase } from "../../../shared/academyPeople.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");

function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

const at = (iso: string) => new Date(iso);

describe("when a session is live", () => {
  const session = { startDate: "2026-10-29T09:00:00Z", endDate: "2026-10-29T10:00:00Z" };

  it("opens to join a little before it starts and closes when it ends", () => {
    assert.equal(JOIN_OPENS_MINUTES, 15);
    assert.equal(sessionPhase(session, at("2026-10-29T08:44:00Z")), "upcoming");
    assert.equal(sessionPhase(session, at("2026-10-29T08:45:00Z")), "live");
    assert.equal(sessionPhase(session, at("2026-10-29T10:00:00Z")), "live");
    assert.equal(sessionPhase(session, at("2026-10-29T10:01:00Z")), "ended");
  });

  it("gives a session with no end the default length", () => {
    const open = { startDate: "2026-10-29T09:00:00Z" };
    assert.equal(SESSION_DEFAULT_MINUTES, 120);
    assert.equal(sessionPhase(open, at("2026-10-29T10:59:00Z")), "live");
    assert.equal(sessionPhase(open, at("2026-10-29T11:01:00Z")), "ended");
  });
});

describe("editing a session", () => {
  const patch = route(routes, "patch", "/api/events/:id");

  it("is a staff route limited to the cohorts the Trainer teaches", () => {
    assert.match(patch, /isAuthenticated, isTrainer/);
    assert.match(patch, /if \(!batch\) return res\.status\(404\)/);
    assert.match(patch, /if \(!staffCanAccessBatch\(req\.user, batch\)\) return res\.status\(403\)/);
  });

  it("checks dates as scheduling does", () => {
    assert.match(patch, /The date is not a date/);
    assert.match(patch, /The session ends before it starts/);
  });

  it("lets only those who may add links change them, and keeps the links for everyone else", () => {
    assert.match(patch, /canRunOnlineSessions\(req\.user as any\)\s*\? parseOnlineFields\(req\.body, req\.user as any\)\s*: \{ meetingUrl: event\.meetingUrl, videoUrl: event\.videoUrl, materialsUrl: event\.materialsUrl \}/);
  });
});
