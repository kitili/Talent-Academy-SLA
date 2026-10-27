import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deskState, parseAccessRequest, parsePasswordSetup, signInMessage } from "../shared/accessRequest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("access request", () => {
  it("asks for a name, username, and email, and refuses an admin desk", () => {
    const ok = parseAccessRequest({
      name: "Amina Teacher",
      username: "amina",
      email: "amina@school.com",
      role: "teacher",
    });
    assert.equal("error" in ok, false);
    if (!("error" in ok)) {
      assert.equal(ok.email, "amina@school.com");
      assert.equal(ok.role, "teacher");
    }
    assert.equal("error" in parseAccessRequest({ name: "A", username: "ab", email: "nope", role: "admin" }), true);
    assert.equal("error" in parseAccessRequest({ name: "New Trainer", username: "new.trainer", email: "new@school.com", role: "trainer" }), false);
  });

  it("lets an approved person create a password only after the admin signs them in", () => {
    assert.equal(deskState({ approvalStatus: "pending", passwordSet: "no" }), "pending");
    assert.equal(deskState({ approvalStatus: "approved", passwordSet: "no" }), "needs_password");
    assert.equal(deskState({ approvalStatus: "approved", passwordSet: "yes" }), "approved");
    assert.match(signInMessage("pending") || "", /admin/i);
    assert.match(signInMessage("needs_password") || "", /password/i);
    assert.equal(signInMessage("approved"), null);
    const setup = parsePasswordSetup({ identifier: "amina", role: "teacher", password: "mypassword" });
    assert.equal("error" in setup, false);
    assert.equal("error" in parsePasswordSetup({ identifier: "amina", role: "teacher", password: "short" }), true);
  });
});

describe("sign-in portal", () => {
  it("hides the test passwords and offers a request plus a password step", () => {
    const page = read("client/src/pages/unified-auth.tsx");
    const approvals = read("client/src/pages/approvals.tsx");
    assert.equal(page.includes("admin123"), false);
    assert.equal(page.includes("trainer123"), false);
    assert.equal(page.includes("teacher123"), false);
    assert.match(page, /Request a desk/);
    assert.match(page, /\/api\/access-requests/);
    assert.match(page, /Create your password/);
    assert.match(approvals, /set their own password/i);
    assert.match(read("server/auth.ts"), /signInBlock/);
  });
});
