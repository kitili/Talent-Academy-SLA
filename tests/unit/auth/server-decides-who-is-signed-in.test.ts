import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { protectedRedirect, signInRedirect } from "../../../client/src/lib/sessionUser.ts";

/**
 * The server decides who is signed in (plan Track A, finding 17). The client used to trust the user cached in
 * sessionStorage, with `staleTime: Infinity`, so another tab or a restored page kept the old desk. Now the stored
 * user is a placeholder while `/api/user` runs, and only the server's answer redirects.
 *
 * The rule lives in `signInRedirect` and `protectedRedirect`, tested here. The pages that use it cannot be rendered
 * in this suite, so a text contract proves they call it and no longer read the stored user. Whether a page restored
 * by the Back button asks again is checked by hand at acceptance.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const trainer = { role: "trainer" };
const teacher = { role: "teacher" };

describe("the server decides who is signed in", () => {
  it("does not redirect on a stored placeholder before the server answers", () => {
    assert.equal(signInRedirect({ answered: false, user: trainer }), null);
    assert.equal(protectedRedirect({ answered: false, user: undefined }), null);
    assert.equal(protectedRedirect({ answered: false, user: null }), null);
  });

  it("sends a visitor the server says is signed in to their own desk", () => {
    assert.equal(signInRedirect({ answered: true, user: teacher }), "/teacher/dashboard");
    assert.equal(signInRedirect({ answered: true, user: trainer }), "/trainer/batches");
    assert.equal(signInRedirect({ answered: true, user: { role: "admin" } }), "/admin");
    assert.equal(protectedRedirect({ answered: true, user: teacher }), null);
  });

  it("sends a visitor the server says is signed out to sign-in", () => {
    assert.equal(protectedRedirect({ answered: true, user: null }), "/auth");
    assert.equal(signInRedirect({ answered: true, user: null }), null);
  });

  it("the auth query asks the server on every load and keeps the stored user as a placeholder", () => {
    const hook = source("client/src/hooks/use-auth.tsx");
    const query = hook.slice(hook.indexOf('queryKey: ["/api/user"]'), hook.indexOf("});", hook.indexOf('queryKey: ["/api/user"]')));
    assert.ok(query.length > 0, "the /api/user query is gone from use-auth.tsx");
    assert.doesNotMatch(query, /initialData/, "the stored user is the query's answer again");
    assert.doesNotMatch(query, /staleTime:\s*Infinity/);
    assert.match(query, /staleTime:\s*0/, "the query falls back to the client default, staleTime: Infinity");
    assert.match(query, /placeholderData:\s*\(\)\s*=>\s*readSessionUser\(\)/);
    assert.match(hook, /isLoading: !answered/, "isLoading no longer means the server has not answered");
  });

  it("logout is one request, awaited before the reload", () => {
    const hook = source("client/src/hooks/use-auth.tsx");
    const logout = hook.slice(hook.indexOf("const logoutMutation"), hook.indexOf("const isAdmin"));
    assert.ok(logout.length > 0, "logoutMutation is gone from use-auth.tsx");
    assert.doesNotMatch(logout, /\/api\/teacher\/logout/);
    assert.doesNotMatch(logout, /allSettled/);
    assert.match(logout, /mutationFn: async \(\) => \{\n\s*await fetch\("\/api\/logout"/);
    assert.ok(logout.indexOf("onSettled") > logout.indexOf("mutationFn"));
    assert.match(logout, /onSettled:[\s\S]*window\.location\.replace\("\/auth"\)/);
  });

  for (const [page, rule] of [
    ["client/src/pages/unified-auth.tsx", "signInRedirect"],
    ["client/src/pages/role-home.tsx", "signInRedirect"],
    ["client/src/lib/protected-route.tsx", "protectedRedirect"],
  ] as const) {
    it(`${page} redirects on ${rule}, not on the stored user`, () => {
      const text = source(page);
      assert.match(text, new RegExp(`${rule}\\(\\{ answered: !isLoading, user \\}\\)`));
      assert.doesNotMatch(text, /readSessionUser/);
    });
  }
});
