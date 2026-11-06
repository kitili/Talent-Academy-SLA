import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { filterByKind, kindLabelOf, listKindOf, ownKindLabel } from "../../../client/src/lib/personKind.ts";
import { splitLiveSessions } from "../../../client/src/lib/liveSessions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("the badge's label choice (ownKindLabel, used by KindBadge)", () => {
  it("names a Fellow's and a Trainer's own kind", () => {
    assert.equal(ownKindLabel({ role: "teacher", fellowType: "pre_service" }), "Pre-service");
    assert.equal(ownKindLabel({ role: "teacher", fellowType: "in_house" }), "In-house");
    assert.equal(ownKindLabel({ role: "trainer", trainerType: "instructional" }), "Instructional");
    assert.equal(ownKindLabel({ role: "trainer", trainerType: "in_house" }), "In-house");
  });
  it("falls back to in-house for a person signed in with no stored kind, and shows nothing for an Admin or nobody", () => {
    assert.equal(ownKindLabel({ role: "teacher" }), "In-house");
    assert.equal(ownKindLabel({ role: "admin", trainerType: "instructional" }), null);
    assert.equal(ownKindLabel(null), null);
  });
  it("a Trainer's kind is not read from the Fellow field", () => {
    assert.equal(ownKindLabel({ role: "trainer", fellowType: "pre_service" }), "In-house");
  });
});

describe("the People list filter (filterByKind, used by the Fellows and Trainers pages)", () => {
  const fellows = [{ id: "a", fellowType: "in_house" }, { id: "b", fellowType: "pre_service" }, { id: "c" }];
  const trainers = [{ id: "a", trainerType: "instructional" }, { id: "b", trainerType: "in_house" }];
  it("All keeps everyone", () => {
    assert.equal(filterByKind(fellows, "teacher", "all").length, 3);
  });
  it("one kind keeps only that kind, and a row with no known kind is in neither", () => {
    assert.deepEqual(filterByKind(fellows, "teacher", "pre_service").map((r) => r.id), ["b"]);
    assert.deepEqual(filterByKind(fellows, "teacher", "in_house").map((r) => r.id), ["a"]);
  });
  it("filters Trainers by their own field", () => {
    assert.deepEqual(filterByKind(trainers, "trainer", "instructional").map((r) => r.id), ["a"]);
    assert.deepEqual(filterByKind(trainers, "trainer", "in_house").map((r) => r.id), ["b"]);
  });
  it("a list row without the field has no kind rather than a default", () => {
    assert.equal(listKindOf("teacher", {}), undefined);
    assert.equal(kindLabelOf("teacher", undefined), null);
    assert.equal(kindLabelOf("trainer", "instructional"), "Instructional");
  });
});

describe("the live sessions page's grouping (splitLiveSessions)", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const at = (iso: string, end?: string) => ({ eventType: "session", startDate: iso, endDate: end ?? null });
  it("splits live, coming up and past, with past newest first and non-sessions left out", () => {
    const rows = [
      { id: "next", ...at("2026-11-07T10:00:00Z") },
      { id: "now", ...at("2026-11-06T09:30:00Z", "2026-11-06T11:00:00Z") },
      { id: "old1", ...at("2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z") },
      { id: "old2", ...at("2026-11-03T10:00:00Z", "2026-11-03T11:00:00Z") },
      { id: "exam", eventType: "assessment", startDate: "2026-11-08T10:00:00Z", endDate: null },
    ];
    const groups = splitLiveSessions(rows, now);
    assert.deepEqual(groups.live.map((r) => r.id), ["now"]);
    assert.deepEqual(groups.upcoming.map((r) => r.id), ["next"]);
    assert.deepEqual(groups.past.map((r) => r.id), ["old2", "old1"]);
  });
});

// Text contract: reads the source, does not render the pages.
describe("the pages use the kind helpers (text contract)", () => {
  it("both People lists filter and draw the kind through the tested functions", () => {
    for (const [path, role] of [["client/src/pages/admin-teachers.tsx", "teacher"], ["client/src/pages/admin-trainers.tsx", "trainer"]]) {
      const text = source(path);
      assert.match(text, new RegExp(`filterByKind\\([^)]*"${role}"`), path);
      assert.match(text, new RegExp(`<KindChip role="${role}"`), path);
    }
  });
  it("Account settings shows the signed-in person's own kind", () => {
    assert.match(source("client/src/components/ProfileSettingsDialog.tsx"), /<KindBadge \/>/);
  });
});

describe("the live sessions page reads the existing session route (text contract)", () => {
  const page = source("client/src/pages/trainer-live-sessions.tsx");
  const calendar = source("client/src/pages/academy-calendar.tsx");
  it("uses the same query key and cohort route as the Calendar, and adds no route of its own", () => {
    assert.match(page, /queryKey: \["\/api\/timetable"\]/);
    assert.match(calendar, /queryKey: \["\/api\/timetable"\]/);
    assert.match(page, /queryKey: \["\/api\/batches"\]/);
    assert.doesNotMatch(page, /apiRequest|"\/api\/[a-z-]*live/);
  });
  it("gates on canRunOnlineSessions and uses SessionDialog and SessionLinks", () => {
    assert.match(page, /canRunOnlineSessions\(user/);
    assert.match(page, /<SessionDialog/);
    assert.match(page, /<SessionLinks/);
    assert.match(page, /This page is for instructional Trainers\./);
  });
});
