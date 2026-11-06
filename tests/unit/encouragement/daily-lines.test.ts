import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAILY_LINES,
  ENCOURAGEMENT_FOLLOWS,
  ENCOURAGEMENT_LEADS,
  dailyRole,
  encouragementCandidate,
  type DailyRole,
} from "../../../shared/encouragement.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const roles: DailyRole[] = ["admin", "trainer", "fellow"];
const day = "2026-11-06";

describe("daily line lists", () => {
  it("gives the Admin and the Fellow at least 40 leads and 40 follows each", () => {
    for (const role of ["admin", "fellow"] as const) {
      assert.ok(DAILY_LINES[role].leads.length >= 40, `${role} leads`);
      assert.ok(DAILY_LINES[role].follows.length >= 40, `${role} follows`);
    }
  });

  it("keeps the Trainer's lists as the original exports", () => {
    assert.equal(DAILY_LINES.trainer.leads, ENCOURAGEMENT_LEADS);
    assert.equal(DAILY_LINES.trainer.follows, ENCOURAGEMENT_FOLLOWS);
  });

  it("has no empty line and no line used twice, within or across roles", () => {
    const all = roles.flatMap((role) => [...DAILY_LINES[role].leads, ...DAILY_LINES[role].follows]);
    assert.ok(all.every((line) => line.trim().length > 0));
    assert.equal(new Set(all).size, all.length);
  });

  it("never lets a joined pair from one role equal a pair from another", () => {
    const pairs = new Map<string, string>();
    for (const role of roles) {
      for (const lead of DAILY_LINES[role].leads) {
        for (const follow of DAILY_LINES[role].follows) {
          const text = `${lead} ${follow}`;
          assert.equal(pairs.has(text) && pairs.get(text) !== role, false, text);
          pairs.set(text, role);
        }
      }
    }
  });

  it("keeps lines plain: no real-person attribution and no talk of the software", () => {
    const all = roles.flatMap((role) => [...DAILY_LINES[role].leads, ...DAILY_LINES[role].follows]);
    for (const line of all) {
      assert.equal(/[—–]\s*[A-Z]/.test(line), false, line);
      assert.equal(/\b(quiz|dashboard|login|portal|app|click|button)\b/i.test(line), false, line);
      assert.ok(/[.!]$/.test(line), line);
    }
  });
});

describe("daily line choice by role", () => {
  it("only ever draws a line from the person's own role", () => {
    for (const role of roles) {
      const own = new Set([...DAILY_LINES[role].leads, ...DAILY_LINES[role].follows]);
      for (let i = 0; i < 30; i += 1) {
        const line = encouragementCandidate({ trainerId: `person-${i}`, day, used: [], role }, 0);
        assert.ok(own.has(line), `${role}: ${line}`);
      }
    }
  });

  it("builds pairs from the person's own role once the singles are used", () => {
    for (const role of roles) {
      const { leads, follows } = DAILY_LINES[role];
      const used = [...leads, ...follows];
      const line = encouragementCandidate({ trainerId: "p", day, used, role }, 0);
      assert.ok(leads.some((lead) => line.startsWith(`${lead} `)), `${role}: ${line}`);
      assert.ok(follows.some((follow) => line.endsWith(follow)), `${role}: ${line}`);
    }
  });

  it("skips used lines and gives a new line for everyone, even when every pair is gone", () => {
    for (const role of roles) {
      const { leads, follows } = DAILY_LINES[role];
      const used: string[] = [...leads, ...follows];
      for (const lead of leads) for (const follow of follows) used.push(`${lead} ${follow}`);
      const line = encouragementCandidate({ trainerId: "p", day, used, role }, 0);
      assert.equal(used.includes(line), false, role);
      used.push(line);
      const next = encouragementCandidate({ trainerId: "p", day, used, role }, 0);
      assert.equal(used.includes(next), false, role);
    }
  });

  it("gives 120 different people 120 different lines in each role", () => {
    for (const role of roles) {
      const used: string[] = [];
      for (let i = 0; i < 120; i += 1) {
        const line = encouragementCandidate({ trainerId: `${role}-${i}`, day, used, role }, 0);
        assert.equal(used.includes(line), false, `${role} ${i}`);
        used.push(line);
      }
    }
  });

  it("keeps the Trainer's output unchanged, whether or not the role is named", () => {
    // Values produced by the code before roles existed (b6887fa).
    const pinned: Array<[string, string, number, string]> = [
      ["amina", "2026-10-21", 0, "The way you listen teaches more than a long speech."],
      ["amina", "2026-10-21", 72, "Your belief in them is already doing its work. Leave them proud of the step they took."],
      ["paul", "2026-10-22", 0, "You notice the effort that others walk past."],
      ["paul", "2026-10-22", 72, "A patient explanation from you unlocks a stuck morning. Keep offering the same welcome."],
      ["x1", "2026-11-06", 0, "A patient explanation from you unlocks a stuck morning."],
      ["x1", "2026-11-06", 72, "You keep faith with people who are still learning. Your steadiness is the point."],
    ];
    for (const [trainerId, d, attempt, expected] of pinned) {
      assert.equal(encouragementCandidate({ trainerId, day: d, used: [] }, attempt), expected);
      assert.equal(encouragementCandidate({ trainerId, day: d, used: [], role: "trainer" }, attempt), expected);
    }
  });

  it("treats an unknown role as a Trainer", () => {
    assert.equal(dailyRole("admin"), "admin");
    assert.equal(dailyRole("fellow"), "fellow");
    assert.equal(dailyRole("trainer"), "trainer");
    assert.equal(dailyRole("teacher"), "trainer");
    assert.equal(dailyRole(undefined), "trainer");
  });
});

describe("daily line wiring (text contract: the route and the store are read, not run)", () => {
  const route = read("server/dailyLineRoutes.ts");
  const store = read("server/trainerEncouragement.ts");

  it("serves GET /api/daily-line to any signed-in person and fails to an empty line", () => {
    assert.match(route, /app\.get\("\/api\/daily-line", guards\.isAuthenticatedAny/);
    assert.match(route, /catch \(error\)[\s\S]*console\.error[\s\S]*line: ""/);
  });

  it("takes the person and the role from the session only, never from the request", () => {
    assert.match(route, /req\.teacherId/);
    assert.match(route, /"fellow"/);
    assert.match(route, /req\.user/);
    for (const source of ["req.body", "req.query", "req.params", "req.headers"]) {
      assert.equal(route.includes(source), false, source);
    }
  });

  it("reuses the table whose unique message index makes a line never repeat", () => {
    assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_encouragement_message/);
    assert.match(store, /encouragementFor\(trainerId: string, role: string = "trainer"/);
    assert.match(store, /role: lineRole/);
  });

  it("keeps the Trainer call in server/routes.ts working", () => {
    assert.match(read("server/routes.ts"), /encouragementFor\(req\.user\.id\)/);
  });

  it("shows the line quietly, and nothing while loading or empty", () => {
    const component = read("client/src/components/DailyLine.tsx");
    assert.match(component, /queryKey: \["\/api\/daily-line"\]/);
    assert.match(component, /if \(!data\?\.line\) return null;/);
    assert.match(component, /text-sm text-sl-muted/);
  });
});
