import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LEARNING_BATCHES, LEARNING_STAGES, LESSON_STAGES, RETIRED_BATCH_NAMES, batchTitle, cohortName } from "../shared/tanzaniaPath.ts";

describe("Tanzanian teacher path", () => {
  it("trains playgroup through Standard 7, then secondary", () => {
    assert.deepEqual(LEARNING_STAGES.map((stage) => stage.id), [
      "playgroup",
      "pre-primary",
      "std-1-2",
      "std-3-6",
      "std-7",
      "secondary",
    ]);
    assert.equal(LEARNING_STAGES.filter((stage) => stage.track === "primary").length, 5);
    assert.equal(LEARNING_STAGES.filter((stage) => stage.track === "secondary").length, 1);
  });

  it("uses Montessori for playgroup and the government lesson shape everywhere else", () => {
    const playgroup = LEARNING_STAGES[0];
    assert.equal(playgroup.method, "Montessori");
    assert.deepEqual(playgroup.modules.map((module) => module.focus), [
      "Practical life",
      "Sensorial",
      "Language",
      "Mathematics",
      "Culture",
    ]);
    assert.deepEqual([...LESSON_STAGES], [
      "Introduction",
      "Competence development",
      "Design",
      "Realisation",
    ]);
    assert.match(LEARNING_STAGES[2].modules.at(-1)?.objective || "", /Introduction/);
  });

  it("gives primary and secondary trainers their own batches", () => {
    assert.equal(batchTitle("playgroup"), "Playgroup — Montessori");
    assert.equal(batchTitle("secondary"), "Secondary — Form I");
    assert.equal(cohortName(LEARNING_BATCHES[6]), "Secondary — Form I practice");
    const primaryTrainers = new Set(
      LEARNING_BATCHES.filter((batch) => batch.stageId !== "secondary").map((batch) => batch.trainerUsername),
    );
    const secondaryTrainers = new Set(
      LEARNING_BATCHES.filter((batch) => batch.stageId === "secondary").map((batch) => batch.trainerUsername),
    );
    assert.equal(primaryTrainers.has("trainer1"), true);
    assert.equal(secondaryTrainers.has("trainer6"), true);
    assert.equal([...primaryTrainers].some((name) => secondaryTrainers.has(name)), false);
    assert.ok(RETIRED_BATCH_NAMES.includes("Batch 1 — Classroom practice"));
  });
});
