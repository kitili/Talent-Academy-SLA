import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("admin academy certificates", () => {
  it("puts official templates on the admin Certificates tab, keeps signatures, and issues words only at graduation or course completion", () => {
    const app = read("client/src/App.tsx");
    const page = read("client/src/pages/admin-certificates.tsx");
    const nav = read("client/src/components/AdminNav.tsx");
    const routes = read("server/routes.ts");
    const storage = read("server/storage.ts");
    const overlay = read("client/src/components/SilverleafCertificate.tsx");
    const copy = read("shared/talentCertificate.ts") + read("shared/certificateDesigns.ts");
    assert.match(app, /\/admin\/certificates" component=\{AdminCertificates\}/);
    assert.match(nav, /\/admin\/certificates/);
    assert.match(page, /button-template-\$\{id\}/);
    assert.match(page, /CERTIFICATE_DESIGNS/);
    assert.match(page, /select-certificate-occasion/);
    // The board names the kinds Course certificate, Fellowship and Advanced Level (it used to say Graduation and Course completion).
    assert.match(page, /Course certificate/);
    assert.match(page, /Advanced Level/);
    assert.match(copy, /Aloyce Shirima/);
    assert.match(copy, /Nelly Zablon/);
    assert.match(overlay, /text-certificate-name/);
    // The panel over the template's printed sample name is the template's own navy, clears its heading
    // (top 41.5%) and signatures (bottom 27%), and survives printing to PDF without background graphics.
    assert.match(overlay, /TEMPLATE_NAVY = "#002367"/);
    assert.equal(overlay.includes("#0d2454"), false);
    assert.match(overlay, /top-\[41\.5%\] bottom-\[27%\]/);
    assert.match(overlay, /\[print-color-adjust:exact\]/);
    assert.match(copy, /cert-fellowship\.jpg/);
    assert.match(copy, /cert-advanced\.jpg/);
    assert.match(routes, /\/api\/admin\/certificates\/issue/);
    assert.match(routes, /isStrictAdmin/);
    assert.match(storage, /issueAcademyCertificate/);
    assert.match(storage, /syncTeacherCourseCompletion\(teacherId, courseId\);\r?\n    return null;/);
    assert.equal(read("client/src/pages/teacher-certificate-view.tsx").includes("canEdit = false"), true);
  });

  it("says Fellow, lists who is ready as the server computes it, and shows the server's refusal sentence (D4, D13)", () => {
    const page = read("client/src/pages/admin-certificates.tsx");
    const designs = read("shared/certificateDesigns.ts");
    assert.match(page, /<Label>Fellow<\/Label>/);
    assert.equal(page.includes("<Label>Teacher</Label>"), false);
    assert.match(page, /queryKey: \["\/api\/admin\/certificates\/eligible"\]/);
    assert.match(page, /data-testid="text-certificate-refusal"/);
    assert.match(page, /setRefusalText\(error\.message\)/);
    assert.match(page, /data\?\.error/);
    // D4b: the course wording names the course; the topic list stays only on Fellowship and Advanced.
    const courseBody = designs.slice(designs.indexOf("export function courseCompletionBody"), designs.indexOf("export const PATH_INCOMPLETE_REFUSAL"));
    assert.match(courseBody, /successfully completing \$\{courseName\}\. Congratulations!/);
    assert.equal(courseBody.includes("Culture of Achievement"), false);
  });

  it("drops the two certificate pages nothing linked to", () => {
    const app = read("client/src/App.tsx");
    assert.equal(app.includes("admin-certificate-approval"), false);
    assert.equal(app.includes("admin-certificate-view"), false);
    assert.equal(existsSync(join(root, "client/src/pages/admin-certificate-approval.tsx")), false);
    assert.equal(existsSync(join(root, "client/src/pages/admin-certificate-view.tsx")), false);
  });
});
