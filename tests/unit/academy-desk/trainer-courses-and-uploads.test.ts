import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { trainerMayEditCourse, type ScopeReaders } from "../../../server/scope.ts";
import { isBlobUrl, isVideoName, UPLOAD_CONTENT_TYPES, UPLOAD_MAX_BYTES } from "../../../shared/uploads.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");
const desk = source("server/academyDesk.ts");
const menu = source("client/src/components/deskMenu.ts");

function route(text: string, verb: string, path: string) {
  const start = text.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = text.indexOf("\n  app.", start + 10);
  return text.slice(start, next === -1 ? undefined : next);
}

function readers(overrides: Partial<ScopeReaders>): ScopeReaders {
  return {
    trainerCohorts: async () => [],
    cohortIdsHoldingCourse: async () => [],
    teacherCohorts: async () => [],
    cohortSteps: async () => [],
    cohortPlacements: async () => [],
    ...overrides,
  };
}

describe("Trainers make and edit courses", () => {
  const trainer = { id: "t1", role: "trainer" };

  it("lets the Trainer who made a course edit it before it is on any cohort", async () => {
    assert.equal(await trainerMayEditCourse(trainer, "c1", readers({ courseCreator: async () => "t1" })), true);
  });

  it("refuses another Trainer's course that is not on their cohorts", async () => {
    assert.equal(await trainerMayEditCourse(trainer, "c1", readers({ courseCreator: async () => "t2" })), false);
    assert.equal(await trainerMayEditCourse(trainer, "c1", readers({ courseCreator: async () => null })), false);
  });

  it("still lets a Trainer edit a course on a cohort they teach", async () => {
    const r = readers({
      courseCreator: async () => null,
      trainerCohorts: async () => [{ id: "b1" } as any],
      cohortIdsHoldingCourse: async () => ["b1"],
    });
    assert.equal(await trainerMayEditCourse(trainer, "c1", r), true);
  });

  it("works with readers that do not know who made a course", async () => {
    assert.equal(await trainerMayEditCourse(trainer, "c1", readers({})), false);
  });

  it("opens course creation and editing to Trainers but keeps deleting for the Admin", () => {
    assert.match(route(desk, "post", "/api/trainer/courses"), /isAuthenticated, isTrainer/);
    assert.match(route(desk, "post", "/api/trainer/courses"), /createdBy: req\.user!\.id/);
    assert.match(route(desk, "post", "/api/trainer/courses"), /trainerOwnsBatch\(req\.user, cohort\)/);
    assert.match(route(desk, "post", "/api/trainer/courses/:id/cohorts"), /trainerMayEditCourse\(req\.user, course\.id\)/);
    assert.match(route(routes, "patch", "/api/courses/:id"), /trainerMayEditCourse\(req\.user, req\.params\.id\)/);
    assert.match(route(routes, "delete", "/api/courses/:id"), /isAuthenticated, isAdmin/);
  });

  it("puts Courses on the Trainer menu", () => {
    assert.match(menu, /\{ key: "courses", label: "Courses", href: "\/trainer\/courses"/);
  });
});

describe("uploads straight to Blob", () => {
  it("knows a Blob file from any other address", () => {
    assert.equal(isBlobUrl("https://abc123.public.blob.vercel-storage.com/training/talk-x1.mp4"), true);
    assert.equal(isBlobUrl("http://abc123.public.blob.vercel-storage.com/a.mp4"), false);
    assert.equal(isBlobUrl("https://evil.example/public.blob.vercel-storage.com/a.mp4"), false);
    assert.equal(isBlobUrl("https://public.blob.vercel-storage.com.evil.example/a.mp4"), false);
    assert.equal(isBlobUrl("/objects/local/1234"), false);
    assert.equal(isBlobUrl(undefined), false);
  });

  it("plays videos and allows the lesson file types", () => {
    assert.equal(isVideoName("Session 3.MP4"), true);
    assert.equal(isVideoName("slides.pptx"), false);
    assert.ok(UPLOAD_CONTENT_TYPES.includes("video/*"));
    assert.ok(!UPLOAD_CONTENT_TYPES.includes("text/html"));
    assert.equal(UPLOAD_MAX_BYTES, 500 * 1024 * 1024);
  });

  it("signs uploads only for a signed-in Trainer or Admin, with the type and size limits", () => {
    const sign = route(routes, "post", "/api/blob-upload");
    assert.match(sign, /if \(role !== "admin" && role !== "trainer"\) throw/);
    assert.match(sign, /allowedContentTypes: UPLOAD_CONTENT_TYPES/);
    assert.match(sign, /maximumSizeInBytes: UPLOAD_MAX_BYTES/);
  });
});
