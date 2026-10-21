import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rollupTrainer } from "../server/attendanceBoard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("password after an admin signs someone in", () => {
  it("shows Create your password only after a refresh finds an accepted desk", () => {
    const page = read("client/src/pages/unified-auth.tsx");
    const server = read("server/accessRequests.ts");
    assert.match(page, /sl-desk-request/);
    assert.match(page, /passwordReady/);
    assert.match(page, /needs_password/);
    assert.match(page, /Create your password/);
    assert.match(page, /role\.value !== "admin"/);
    assert.match(server, /\/api\/access-requests\/status/);
    assert.match(server, /Choose trainer or teacher/);
  });
});

describe("admin attendance lists", () => {
  it("weights a trainer's rate by the marks in each cohort", () => {
    assert.deepEqual(
      rollupTrainer([
        { marked: 1, rate: 100 },
        { marked: 3, rate: 0 },
      ]),
      { marked: 4, rate: 25 },
    );
    assert.deepEqual(rollupTrainer([]), { marked: 0, rate: null });
    assert.deepEqual(rollupTrainer([{ marked: 0, rate: null }]), { marked: 0, rate: null });
  });

  it("lists teachers and trainers on the attendance desk and in analytics only", () => {
    const board = read("server/attendanceBoard.ts");
    const routes = read("server/routes.ts");
    const list = read("client/src/components/AttendanceBoard.tsx");
    assert.match(routes, /\/api\/admin\/attendance-summary/);
    assert.match(routes, /isStrictAdmin/);
    assert.match(board, /attendance_records/);
    assert.match(board, /approval_status = 'approved'/);
    assert.match(board, /cohort_trainers/);
    assert.match(read("client/src/pages/admin-attendance.tsx"), /AttendanceBoard/);
    assert.equal(read("client/src/pages/admin-home.tsx").includes("AttendanceBoard"), false);
    assert.match(read("client/src/pages/admin-analytics.tsx"), /AttendanceBoard/);
    assert.match(list, /title="Teachers"/);
    assert.match(list, /title="Trainers"/);
  });
});
