import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMaterialFileUrl,
  materialReachesFellow,
  materialRecipients,
  materialsForFellow,
  newestFirst,
  parseMaterialBody,
  type MaterialRow,
} from "../../../server/materialRoutes.ts";

const BLOB = "https://abc123.public.blob.vercel-storage.com/training/notes-x1.pdf";
const LOCAL = "/api/local-objects/123e4567-e89b-12d3-a456-426614174000";
const ROSTER = ["fellow-1", "fellow-2"];

function row(over: Partial<MaterialRow>): MaterialRow {
  return {
    id: "m1",
    batchId: "cohort-1",
    title: "Reading list",
    note: null,
    fileUrl: BLOB,
    fileName: "notes.pdf",
    linkUrl: null,
    teacherIds: [],
    createdBy: "trainer-1",
    createdAt: "2026-11-01T08:00:00.000Z",
    ...over,
  };
}

function errorOf(body: unknown) {
  const parsed = parseMaterialBody(body, ROSTER);
  return "error" in parsed ? parsed.error : null;
}

function materialOf(body: unknown) {
  const parsed = parseMaterialBody(body, ROSTER);
  assert.ok("material" in parsed, "error" in parsed ? parsed.error : "");
  return parsed.material;
}

describe("the file of a material", () => {
  it("accepts a Blob address and the server's own upload paths", () => {
    assert.equal(isMaterialFileUrl(BLOB), true);
    assert.equal(isMaterialFileUrl(LOCAL), true);
    assert.equal(isMaterialFileUrl("/objects/local/123e4567-e89b-12d3-a456-426614174000"), true);
  });

  it("refuses a script address, another site, and an upload path buried in another address", () => {
    for (const address of [
      "javascript:alert(1)",
      "javascript:alert(1)//objects/local/123e4567-e89b-12d3-a456-426614174000",
      "https://evil.example/notes.pdf",
      "https://evil.example/api/local-objects/123e4567-e89b-12d3-a456-426614174000",
      "//evil.example/objects/local/123e4567-e89b-12d3-a456-426614174000",
      "/api/local-objects/not-an-id",
      "/api/local-objects/123e4567-e89b-12d3-a456-426614174000/../../logout",
      "http://abc123.public.blob.vercel-storage.com/a.pdf",
      42,
      { url: BLOB },
    ]) {
      assert.equal(isMaterialFileUrl(address), false, String(address));
    }
  });
});

describe("a new material", () => {
  it("needs a title", () => {
    assert.equal(errorOf({ fileUrl: BLOB }), "Add a title");
    assert.equal(errorOf({ title: "   ", fileUrl: BLOB }), "Add a title");
    assert.equal(errorOf({ title: { text: "x" }, fileUrl: BLOB }), "Add a title");
    assert.equal(errorOf(undefined), "Add a title");
  });

  it("needs a file or a link, and takes either or both", () => {
    assert.equal(errorOf({ title: "Notes" }), "Add a file or a link");
    assert.equal(errorOf({ title: "Notes", fileUrl: "", linkUrl: "" }), "Add a file or a link");
    assert.equal(materialOf({ title: "Notes", fileUrl: BLOB }).fileUrl, BLOB);
    assert.equal(materialOf({ title: "Notes", linkUrl: "https://example.com/a" }).linkUrl, "https://example.com/a");
    const both = materialOf({ title: "Notes", fileUrl: LOCAL, linkUrl: "https://example.com/a" });
    assert.equal(both.fileUrl, LOCAL);
    assert.equal(both.linkUrl, "https://example.com/a");
  });

  it("refuses a bad link, and does not fall back to the file when one is sent", () => {
    for (const linkUrl of ["javascript:alert(1)", "data:text/html,x", "not a link", { url: "x" }]) {
      assert.equal(errorOf({ title: "Notes", linkUrl }), "Links must start with https://");
      assert.equal(errorOf({ title: "Notes", fileUrl: BLOB, linkUrl }), "Links must start with https://");
    }
  });

  it("refuses a file address that is not one of our uploads", () => {
    assert.match(errorOf({ title: "Notes", fileUrl: "javascript:alert(1)" }) || "", /not uploaded here/);
    assert.match(errorOf({ title: "Notes", fileUrl: "https://evil.example/a.pdf", linkUrl: "https://example.com" }) || "", /not uploaded here/);
  });

  it("keeps a file name only with a file, and tidies the text", () => {
    assert.equal(materialOf({ title: "Notes", linkUrl: "https://example.com", fileName: "x.pdf" }).fileName, null);
    const material = materialOf({ title: "  Notes  ", note: "  read this ", fileUrl: BLOB, fileName: " x.pdf " });
    assert.equal(material.title, "Notes");
    assert.equal(material.note, "read this");
    assert.equal(material.fileName, "x.pdf");
    assert.equal(materialOf({ title: "Notes", note: "   ", fileUrl: BLOB }).note, null);
  });
});

describe("who a new material may name", () => {
  it("empty or absent means the whole cohort", () => {
    assert.deepEqual(materialOf({ title: "Notes", fileUrl: BLOB }).teacherIds, []);
    assert.deepEqual(materialOf({ title: "Notes", fileUrl: BLOB, teacherIds: [] }).teacherIds, []);
  });

  it("names Fellows on the roster, once each", () => {
    assert.deepEqual(materialOf({ title: "Notes", fileUrl: BLOB, teacherIds: ["fellow-2", "fellow-2"] }).teacherIds, ["fellow-2"]);
  });

  it("refuses the whole list when any one is not in the cohort, rather than sending to the rest", () => {
    const error = "Choose Fellows who are in this cohort";
    assert.equal(errorOf({ title: "Notes", fileUrl: BLOB, teacherIds: ["outsider"] }), error);
    assert.equal(errorOf({ title: "Notes", fileUrl: BLOB, teacherIds: ["fellow-1", "outsider"] }), error);
  });

  it("refuses a malformed list, which must never read as the whole cohort", () => {
    const error = "Choose Fellows who are in this cohort";
    for (const teacherIds of ["fellow-1", { 0: "fellow-1" }, [1], [""], [null], true, 0]) {
      assert.equal(errorOf({ title: "Notes", fileUrl: BLOB, teacherIds }), error, JSON.stringify(teacherIds));
    }
  });
});

describe("who receives a material", () => {
  it("reaches everyone when no one is named, otherwise only those named", () => {
    assert.equal(materialReachesFellow({ teacherIds: [] }, "fellow-1"), true);
    assert.equal(materialReachesFellow({ teacherIds: ["fellow-1"] }, "fellow-1"), true);
    assert.equal(materialReachesFellow({ teacherIds: ["fellow-2"] }, "fellow-1"), false);
  });

  it("reaches nobody when the stored list is not a list", () => {
    for (const teacherIds of [null, undefined, "fellow-1", {}]) {
      assert.equal(materialReachesFellow({ teacherIds }, "fellow-1"), false);
    }
  });

  it("gives a Fellow theirs, newest first, with the cohort name, and without who else was named", () => {
    const rows = [
      row({ id: "older", createdAt: "2026-10-01T08:00:00.000Z" }),
      row({ id: "named-me", teacherIds: ["fellow-1"], createdAt: "2026-11-02T08:00:00.000Z" }),
      row({ id: "named-another", teacherIds: ["fellow-2"], createdAt: "2026-11-03T08:00:00.000Z" }),
      row({ id: "other-cohort", batchId: "cohort-2", createdAt: "2026-11-04T08:00:00.000Z" }),
    ];
    const mine = materialsForFellow(rows, "fellow-1", [{ id: "cohort-1", name: "January intake" }]);
    assert.deepEqual(mine.map((material) => material.id), ["named-me", "older"]);
    assert.equal(mine[0].cohortName, "January intake");
    for (const material of mine) {
      assert.equal("teacherIds" in material, false);
      assert.equal("createdBy" in material, false);
    }
  });

  it("orders by time whatever form the time takes, and puts undated rows last", () => {
    const rows = [
      { id: "a", createdAt: null },
      { id: "b", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "c", createdAt: "2026-02-01T00:00:00Z" },
    ];
    assert.deepEqual(newestFirst(rows).map((item) => item.id), ["c", "b", "a"]);
  });

  it("notifies those named, or the roster when no one is", () => {
    assert.deepEqual(materialRecipients(["fellow-2"], ROSTER), ["fellow-2"]);
    assert.deepEqual(materialRecipients([], ROSTER), ROSTER);
  });
});
