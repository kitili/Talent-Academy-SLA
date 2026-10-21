import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.match(page, /Graduation/);
    assert.match(page, /Course completion/);
    assert.match(copy, /Aloyce Shirima/);
    assert.match(copy, /Nelly Zablon/);
    assert.match(overlay, /text-certificate-name/);
    assert.match(copy, /cert-fellowship\.jpg/);
    assert.match(copy, /cert-advanced\.jpg/);
    assert.match(routes, /\/api\/admin\/certificates\/issue/);
    assert.match(routes, /isStrictAdmin/);
    assert.match(storage, /issueAcademyCertificate/);
    assert.match(storage, /syncTeacherCourseCompletion\(teacherId, courseId\);\n    return null;/);
    assert.equal(read("client/src/pages/teacher-certificate-view.tsx").includes("canEdit = false"), true);
  });
});
