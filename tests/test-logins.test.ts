import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchTestLogin, TEST_LOGINS } from "../server/testLogins.ts";

describe("test logins", () => {
  it("accepts each documented desk with its own password", () => {
    assert.equal(matchTestLogin("admin", "admin123", "admin")?.role, "admin");
    assert.equal(matchTestLogin("ADMIN", "admin123", "admin")?.username, "admin");
    assert.equal(matchTestLogin("trainer1", "trainer123", "trainer")?.email, "trainer@test.com");
    assert.equal(matchTestLogin("Teacher@test.com", "teacher123", "teacher")?.role, "teacher");
  });

  it("keeps an admin password from opening the trainer or teacher desk", () => {
    assert.equal(matchTestLogin("admin", "admin123", "trainer"), undefined);
    assert.equal(matchTestLogin("admin", "admin123", "teacher"), undefined);
    assert.equal(matchTestLogin("trainer1", "admin123", "trainer"), undefined);
    assert.equal(matchTestLogin("teacher@test.com", "trainer123", "teacher"), undefined);
  });

  it("rejects anyone who is not a test desk", () => {
    assert.equal(matchTestLogin("mourine", "admin123", "admin"), undefined);
    assert.equal(matchTestLogin("admin", "changed-password", "admin"), undefined);
    assert.equal(matchTestLogin("new.teacher@school.com", "teacher123", "teacher"), undefined);
    assert.ok(TEST_LOGINS.length >= 3);
    assert.equal(TEST_LOGINS.every((login) => ["admin123", "trainer123", "teacher123"].includes(login.password)), true);
  });
});
