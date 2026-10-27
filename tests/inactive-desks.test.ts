import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Text contract: these tests read server source as text. They pin that start-up keeps inactive desks
// (People folds them below, D7 of plans/lms-flow-fixes/plan.md); they do not run start-up.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function serverFiles(dir = join(root, "server")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return serverFiles(path);
    return /\.(ts|js|mjs)$/.test(entry.name) ? [relative(root, path).replace(/\\/g, "/")] : [];
  });
}

function startUpBody() {
  const source = read("server/ensureTestLogins.ts");
  const body = source.match(/export async function ensureAllTestLogins\(\) \{\r?\n([\s\S]*?)\r?\n\}/)?.[1];
  assert.ok(body, "ensureAllTestLogins is not where this contract expects it");
  return body;
}

describe("start-up does not delete inactive desks", () => {
  it("ensureAllTestLogins awaits only the test-login reset and the flag-gated prune", () => {
    const awaited = [...startUpBody().matchAll(/await (\w+)\(/g)].map((match) => match[1]);
    assert.deepEqual(awaited, ["ensureTestLogin", "pruneExtraDesksOnce"]);
  });

  it("no server file names the removed start-up deletion", () => {
    const files = serverFiles();
    assert.ok(files.includes("server/app.ts") && files.includes("server/ensureTestLogins.ts"), "server/ was not scanned");
    const named = files.filter((file) =>
      /\b(removeInactiveDesks|isRemovableStaff|isRemovableTeacher|removalSteps|applyRemovalSteps)\b/.test(read(file)),
    );
    assert.deepEqual(named, []);
  });

  it("the test-login reset itself deletes nothing", () => {
    const source = read("server/ensureTestLogins.ts");
    assert.match(source, /export async function ensureAllTestLogins\(\)/);
    assert.doesNotMatch(source, /\.delete\(|\bDELETE\b/i);
  });

  it("the one-time prune checks its desk_roster_v2 flag before it changes any desk", () => {
    const source = read("server/deskRoster.ts");
    assert.match(source, /const FLAG = "desk_roster_v2";/);
    const gate = source.search(/SELECT value FROM app_flags WHERE key = \$\{FLAG\}`\);\r?\n\s*if \(\(existing\.rows \|\| \[\]\)\.length > 0\) return;/);
    const firstWrite = source.search(/\.update\(|\.delete\(/);
    assert.ok(gate > 0, "the flag check is gone");
    assert.ok(firstWrite > gate, "a desk is changed before the flag check");
  });
});
