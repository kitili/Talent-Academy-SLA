import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deskName, wallLabel } from "../shared/deskName.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("desk name", () => {
  it("uses a real name and tidies a bare username", () => {
    assert.equal(deskName({ firstName: "Amina", lastName: "Hassan", username: "trainer1" }), "Amina Hassan");
    assert.equal(deskName({ name: "Neema Joseph", username: "neema@school.com" }), "Neema Joseph");
    assert.equal(deskName({ username: "john.doe_trainer1" }), "John Doe");
    assert.equal(deskName({ email: "amina.hassan@school.com" }), "Amina Hassan");
    assert.equal(deskName({ username: "admin" }), "Admin");
    assert.equal(deskName({ username: "trainer1" }), "Trainer");
    assert.equal(deskName({ username: "trainer1", email: "paul.mwangi@school.com" }), "Paul Mwangi");
  });

  it("keeps role logins off the wall", () => {
    assert.equal(wallLabel({ username: "admin" }), "Silverleaf");
    assert.equal(wallLabel({ username: "trainer1" }), "Silverleaf");
    assert.equal(wallLabel({ firstName: "Amina", lastName: "Hassan", username: "trainer1" }), "Amina Hassan");
    assert.equal(wallLabel({ username: "john.doe_trainer1" }), "John Doe");
  });

  it("draws no wall mark: the desks have no photo to write on (design/board/Shell.dc.html)", () => {
    const wall = readFileSync(join(root, "client/src/components/DeskGraffiti.tsx"), "utf8");
    assert.match(wall, /return null;/);
    assert.equal(wall.includes("fixed inset-0"), false);
    assert.equal(wall.includes("Comic Sans"), false);
    assert.equal(wall.includes("Segoe Print"), false);
    assert.equal(wall.includes("Screenshot"), false);
    assert.equal(wall.includes("mixBlendMode"), false);
  });
});
