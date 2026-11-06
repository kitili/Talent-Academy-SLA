import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CERTIFICATE_DESIGNS,
  CERTIFICATE_WORDING_MAX,
  cleanCertificateWording,
  courseCompletionBody,
  wordingForIssue,
} from "../../../shared/certificateDesigns.ts";

/** Item 19: the Admin writes a certificate's wording, and the Fellow can open what was issued. Route wiring is a text contract. */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const routes = source("server/routes.ts");
const page = source("client/src/pages/admin-certificates.tsx");
const view = source("client/src/pages/teacher-certificate-view.tsx");

function route(verb: string, path: string) {
  const start = routes.indexOf(`app.${verb}("${path}"`);
  assert.notEqual(start, -1, `${verb.toUpperCase()} ${path} is missing`);
  const next = routes.indexOf("\n  app.", start + 10);
  return routes.slice(start, next === -1 ? undefined : next);
}

const wordingOf = (value: unknown) => {
  const result = cleanCertificateWording(value);
  assert.ok("wording" in result, JSON.stringify(result));
  return result.wording;
};
const errorOf = (value: unknown) => {
  const result = cleanCertificateWording(value);
  assert.ok("error" in result, JSON.stringify(result));
  return result.error;
};

describe("the certificate's wording", () => {
  it("is required: blank or not text is refused", () => {
    for (const blank of ["", "   ", "\n\t \r\n", undefined, null, 12, {}, ["In recognition"], "\u0000\u0001"]) {
      assert.match(errorOf(blank), /Write the wording/, JSON.stringify(blank));
    }
  });

  it("is trimmed and drawn on one run", () => {
    assert.equal(wordingOf("  In recognition\r\n\r\nof   her work.  "), "In recognition of her work.");
    assert.equal(wordingOf("In\u0000 recognition"), "In recognition");
  });

  it("stops at the limit, counted on the text as stored", () => {
    assert.equal(wordingOf("x".repeat(CERTIFICATE_WORDING_MAX)).length, CERTIFICATE_WORDING_MAX);
    assert.match(errorOf("x".repeat(CERTIFICATE_WORDING_MAX + 1)), /400 characters/);
    assert.equal(wordingOf(`  ${"x".repeat(CERTIFICATE_WORDING_MAX)}  `).length, CERTIFICATE_WORDING_MAX);
  });

  it("holds every wording an Admin starts from", () => {
    for (const design of Object.values(CERTIFICATE_DESIGNS)) {
      assert.equal(wordingOf(design.body), design.body);
    }
    assert.equal(wordingForIssue("fellowship", "course", "Lesson Planning"), courseCompletionBody("Lesson Planning"));
    assert.equal(wordingOf(courseCompletionBody("Lesson Planning")), courseCompletionBody("Lesson Planning"));
  });

  it("is plain text: tags are kept as typed, and nothing draws it as HTML", () => {
    assert.equal(wordingOf("<b>Well done</b>"), "<b>Well done</b>");
    const overlay = source("client/src/components/SilverleafCertificate.tsx");
    assert.doesNotMatch(overlay, /dangerouslySetInnerHTML/);
    assert.match(overlay, /\{shownBody\}/);
  });
});

describe("issuing with the Admin's wording", () => {
  const issue = route("post", "/api/admin/certificates/issue");

  it("refuses before the write, and stores what was cleaned rather than what was sent", () => {
    const check = issue.indexOf("cleanCertificateWording(req.body?.appreciationText)");
    const write = issue.indexOf("storage.issueAcademyCertificate(");
    assert.notEqual(check, -1);
    assert.ok(check < write);
    const refusal = issue.indexOf('if ("error" in wording) return res.status(400).json({ error: wording.error });');
    assert.notEqual(refusal, -1, "a refused wording must stop the route");
    assert.ok(refusal < write);
    assert.match(issue, /appreciationText: wording\.wording/);
    assert.doesNotMatch(issue, /appreciationText: req\.body/);
  });

  it("leaves eligibility where it was: the same refusal, still before the write", () => {
    assert.match(issue, /const refused = await certificateRefusal\(\{ teacherId, occasion, courseId \}\);/);
    assert.ok(issue.indexOf("certificateRefusal(") < issue.indexOf("storage.issueAcademyCertificate("));
  });

  it("stores the text it is given, and no longer works out its own", () => {
    const storage = source("server/storage.ts");
    assert.match(storage, /appreciationText: input\.appreciationText,/);
    assert.doesNotMatch(storage, /wordingForIssue/);
  });

  it("the edit route holds the same rule, so the limit cannot be walked round", () => {
    const patch = route("patch", "/api/certificates/:certId");
    assert.match(patch, /isStrictAdmin/);
    assert.match(patch, /cleanCertificateWording\(appreciationText\)/);
    assert.match(patch, /updates\.appreciationText = wording\.wording/);
    assert.doesNotMatch(patch, /updates\.appreciationText = appreciationText/);
  });
});

describe("the Admin's page", () => {
  it("has a box that starts from the design's wording and that the preview follows", () => {
    assert.match(page, /data-testid="input-certificate-wording"/);
    assert.match(page, /const wordingText = typedWording \?\? startingWording;/);
    assert.match(page, /wordingForIssue\(design, occasion/);
    assert.match(page, /appreciationText: wordingText/);
    assert.match(page, /body=\{previewBody\}/);
  });

  it("shows a cleared box as a blank certificate, not the template's wording", () => {
    assert.match(page, /const previewBody = wordingText\.trim\(\) \|\| " ";/);
  });

  it("will not offer Issue or Print while the wording would be refused", () => {
    assert.match(page, /const canIssue = .*"wording" in wordingCheck;/);
    assert.match(page, /const wordingCheck = cleanCertificateWording\(wordingText\);/);
  });
});

describe("who issues, and who opens", () => {
  it("only an Admin can issue: the route and the page say so", () => {
    assert.match(route("post", "/api/admin/certificates/issue"), /isAuthenticated, isStrictAdmin/);
    assert.match(page, /user\.role !== "admin"/);
  });

  it("a certificate is read by id, and each read route asks about the person it belongs to", () => {
    const one = route("get", "/api/certificates/:certId");
    assert.match(one, /teacherRecordAllowed\(req, cert\.teacherId\)/);
    assert.match(route("get", "/api/teacher/:teacherId/certificates"), /teacherRecordAllowed\(req, req\.params\.teacherId\)/);
  });

  it("a Fellow's session can open their own certificate: their session is not a passport login", () => {
    assert.match(route("get", "/api/certificates/:certId"), /isAuthenticatedAny/);
    assert.match(source("client/src/pages/teacher-certificates.tsx"), /\/teacher\/certificates\/\$\{cert\.id\}\?print=1/);
    assert.match(view, /queryKey: \["\/api\/certificates", certId\]/);
  });
});

describe("the logo", () => {
  it("is imported by its real name, and the old file is gone", () => {
    assert.match(view, /@assets\/silverleaf-logo\.png/);
    assert.doesNotMatch(view, /Screenshot 2025-10-14/);
    assert.equal(existsSync(join(root, "attached_assets/silverleaf-logo.png")), true);
    assert.equal(existsSync(join(root, "attached_assets/Screenshot 2025-10-14 214034_1761029433045.png")), false);
  });
});
