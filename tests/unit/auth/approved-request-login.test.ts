import assert from "node:assert/strict";
import { describe, it } from "node:test";

// No database URL: importing the auth module must not connect to anything.
for (const name of ["NEON_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "SUPABASE_DATABASE_URL"]) {
  delete process.env[name];
}

const { hashPassword, pickApprovedStaff, pickApprovedTeacher } = await import("../../../server/auth.ts");
const { deskState } = await import("../../../shared/accessRequest.ts");

/**
 * An approved request used to fail at sign-in: a Fellow who chose a username could not sign in with it, the
 * password step kept spaces that sign-in trims, and a name that matched two desks only tried the first.
 * `pickApprovedStaff` and `pickApprovedTeacher` are what `findApprovedAccount` (and so `/api/login`) decide with.
 */
describe("signing in after an approved request", () => {
  it("opens an approved Fellow desk once the password is set", async () => {
    const password = await hashPassword("my-secret");
    const fellow = { approvalStatus: "approved", passwordSet: "yes", password };
    assert.equal(await pickApprovedTeacher([fellow], "my-secret"), fellow);
    assert.equal(await pickApprovedTeacher([fellow], "wrong-one"), null);
  });

  it("keeps a desk shut until the password is created, even if the stored hash matches", async () => {
    const password = await hashPassword("my-secret");
    const waiting = { approvalStatus: "approved", passwordSet: "no", password };
    assert.equal(deskState(waiting), "needs_password");
    assert.equal(await pickApprovedTeacher([waiting], "my-secret"), null);
    const pending = { approvalStatus: "pending", passwordSet: "yes", password };
    assert.equal(await pickApprovedTeacher([pending], "my-secret"), null);
  });

  it("tries every desk a name matches and finds the one the password opens", async () => {
    const first = { approvalStatus: "approved", passwordSet: "yes", password: await hashPassword("other-pass") };
    const second = { approvalStatus: "approved", passwordSet: "yes", password: await hashPassword("my-secret") };
    assert.equal(await pickApprovedTeacher([first, second], "my-secret"), second);
  });

  it("picks the Trainer desk when an Admin and a Trainer share a name, and never the wrong role", async () => {
    const password = await hashPassword("shared-pass");
    const admin = { role: "admin", approvalStatus: "approved", passwordSet: "yes", password };
    const trainer = { role: "trainer", approvalStatus: "approved", passwordSet: "yes", password };
    assert.equal(await pickApprovedStaff([admin, trainer], "shared-pass", "trainer"), trainer);
    assert.equal(await pickApprovedStaff([trainer], "shared-pass", "admin"), null);
    assert.equal(await pickApprovedStaff([admin, trainer], "shared-pass", ""), admin);
  });
});
