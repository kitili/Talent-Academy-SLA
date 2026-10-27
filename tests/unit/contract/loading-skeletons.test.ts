import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// plans/skeleton-loaders/plan.md: while data loads a page shows grey bars in the shape of what is coming, never
// "Loading…" text, and the first paint and the sign-in check draw the page in outline.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sources = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({ path: `${dir}/${name}`, text: read(`${dir}/${name}`) }));

// Text a page shows *as content* while it waits. Screen-reader labels inside the kit (`label="Loading …"`) are fine.
const LOADING_TEXT = />\s*(Loading|Opening)[^<{]*(…|\.\.\.)\s*</;

describe("loading states", () => {
  it("no page or component shows Loading… or Opening… text as content", () => {
    const offenders = [...sources("client/src/pages"), ...sources("client/src/components")]
      .filter(({ text }) => LOADING_TEXT.test(text))
      .map(({ path, text }) => `${path}: ${text.match(LOADING_TEXT)?.[0].trim()}`);
    assert.deepEqual(offenders, []);
  });

  it("the first paint and the sign-in check draw the page in outline, not text", () => {
    const html = read("client/index.html");
    assert.equal(/opening sign in/i.test(html), false);
    assert.match(html, /id="boot" role="status" aria-busy="true"/);
    assert.match(read("client/src/lib/protected-route.tsx"), /return <PageSkeleton \/>/);
  });

  it("the kit's bars pulse only when motion is welcome", () => {
    const kit = read("client/src/components/Skeletons.tsx");
    assert.match(kit, /motion-safe:animate-pulse/);
    assert.equal(/[^:]animate-pulse/.test(kit.replace(/motion-safe:animate-pulse/g, "")), false);
  });
});
