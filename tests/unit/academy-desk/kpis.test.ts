import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { countKinds, FELLOW_TYPES, TRAINER_TYPES } from "../../../shared/academyPeople.ts";
import { summarizeTrainerDesk } from "../../../shared/trainerDesk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const storage = source("server/storage.ts");
const routes = source("server/routes.ts");

describe("the dashboards count the newer kinds", () => {
  it("counts each kind of Fellow and Trainer, with zero for a kind nobody has", () => {
    assert.deepEqual(countKinds(["in_house", "pre_service", "in_house"], FELLOW_TYPES), { in_house: 2, pre_service: 1 });
    assert.deepEqual(countKinds([], TRAINER_TYPES), { in_house: 0, instructional: 0 });
  });

  it("sends kinds, the week's sessions and answers to mark to Admin Home", () => {
    for (const field of ["fellowKinds", "trainerKinds", "sessionsNextSevenDays", "onlineSessionsNextSevenDays", "answersToMark"]) {
      assert.match(routes, new RegExp(`${field}:`), field);
    }
  });
});

describe("the Trainer's This term figures", () => {
  const base = { cohorts: [], teacherCount: 3, attendanceRate: null, certificateCount: 0, upcomingEvents: 2, progressPercent: null };

  it("counts uploaded assessments with paper exams, and leaves out stopped papers", () => {
    const desk = summarizeTrainerDesk({
      ...base,
      quizzes: [{ status: "open", paperUrl: "/p1" }, { status: "stopped", paperUrl: "/p2" }, { status: "open", paperUrl: null }],
      uploadedAssessments: 4,
      toMark: 5,
    } as any);
    assert.equal(desk.paperExams, 1);
    assert.equal(desk.assessments, 5);
    assert.equal(desk.toMark, 5);
    assert.equal(desk.upcomingEvents, 2);
  });

  it("reads zero when the new counts are not given", () => {
    const desk = summarizeTrainerDesk({ ...base, quizzes: [] } as any);
    assert.equal(desk.assessments, 0);
    assert.equal(desk.toMark, 0);
  });
});

describe("Admin Analytics measures what its labels say", () => {
  it("counts participation over the last 30 days of lessons, quizzes and handed-in work", () => {
    assert.match(storage, /GREATEST\(p\.viewed_at, p\.completed_at\) >= now\(\) - interval '30 days'/);
    assert.match(storage, /a\.completed_at >= now\(\) - interval '30 days'/);
    assert.match(storage, /s\.submitted_at >= now\(\) - interval '30 days'/);
    assert.match(storage, /participationRate = totalCandidates > 0 \? Math\.round\(\(activeLast30Days \/ totalCandidates\)/);
  });

  it("counts enrolled as approved Fellows on a cohort", () => {
    assert.match(storage, /JOIN teachers t ON t\.id = bt\.teacher_id AND t\.approval_status = 'approved'/);
  });

  it("does not call a cohort nobody started 0% or at risk", () => {
    assert.match(storage, /if \(hasProgress && completionPercentage < 50\) status = 'red'/);
    assert.match(storage, /const started = cohorts\.filter\(\(cohort: any\) => cohort\.hasProgress\)/);
  });
});
