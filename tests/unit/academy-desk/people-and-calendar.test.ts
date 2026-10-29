import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRunOnlineSessions,
  coversDay,
  fellowSeesAllLearning,
  fellowTypeOf,
  groupByMonth,
  parseCalendarEntry,
  parseFellowType,
  parseOnlineFields,
  parseTrainerType,
  safeLink,
  trainerTypeOf,
} from "../../../shared/academyPeople.ts";
import { parseAccessRequest, parsePasswordSetup } from "../../../shared/accessRequest.ts";

describe("kinds of Fellow and Trainer", () => {
  it("knows two kinds of each and falls back to in-house", () => {
    assert.equal(fellowTypeOf("pre_service"), "pre_service");
    assert.equal(fellowTypeOf("instructional"), "in_house");
    assert.equal(fellowTypeOf(undefined), "in_house");
    assert.equal(trainerTypeOf("instructional"), "instructional");
    assert.equal(trainerTypeOf("pre_service"), "in_house");
  });

  it("refuses a kind that is not on the list, and lets an empty form mean in-house", () => {
    assert.equal(parseFellowType(""), "in_house");
    assert.equal(parseFellowType("pre_service"), "pre_service");
    assert.equal(parseFellowType("instructional"), null);
    assert.equal(parseTrainerType("instructional"), "instructional");
    assert.equal(parseTrainerType("pre_service"), null);
  });

  it("gives both kinds of Fellow every lesson", () => {
    assert.equal(fellowSeesAllLearning("in_house"), true);
    assert.equal(fellowSeesAllLearning("pre_service"), true);
  });

  it("lets only an instructional Trainer or an Admin run online sessions", () => {
    assert.equal(canRunOnlineSessions({ role: "admin" }), true);
    assert.equal(canRunOnlineSessions({ role: "trainer", trainerType: "instructional" }), true);
    assert.equal(canRunOnlineSessions({ role: "trainer", trainerType: "in_house" }), false);
    assert.equal(canRunOnlineSessions({ role: "trainer" }), false);
    assert.equal(canRunOnlineSessions({ role: "teacher" }), false);
    assert.equal(canRunOnlineSessions(null), false);
  });
});

describe("the access request carries the kind", () => {
  const base = { name: "Amina Hassan", username: "amina", email: "Amina@School.com" };

  it("defaults to in-house and accepts the matching second kind", () => {
    const fellow = parseAccessRequest({ ...base, role: "teacher" });
    assert.ok(!("error" in fellow) && fellow.type === "in_house" && fellow.email === "amina@school.com");
    const preService = parseAccessRequest({ ...base, role: "teacher", type: "pre_service" });
    assert.ok(!("error" in preService) && preService.type === "pre_service");
    const instructional = parseAccessRequest({ ...base, role: "trainer", type: "instructional" });
    assert.ok(!("error" in instructional) && instructional.type === "instructional");
  });

  it("refuses a Fellow kind on a Trainer request and the other way round", () => {
    assert.ok("error" in parseAccessRequest({ ...base, role: "trainer", type: "pre_service" }));
    assert.ok("error" in parseAccessRequest({ ...base, role: "teacher", type: "instructional" }));
  });

  it("stores the password without stray spaces, as sign-in will read it", () => {
    const parsed = parsePasswordSetup({ identifier: "amina", role: "teacher", password: "  secret12  " });
    assert.ok(!("error" in parsed) && parsed.password === "secret12");
    assert.ok("error" in parsePasswordSetup({ identifier: "amina", role: "teacher", password: "   abc   " }));
  });
});

describe("the annual calendar entry", () => {
  it("accepts a title, a kind and dates", () => {
    const entry = parseCalendarEntry({ title: "  Term 2  begins ", kind: "term", startDate: "2027-05-03", endDate: "2027-08-06" });
    assert.ok(!("error" in entry));
    if (!("error" in entry)) {
      assert.equal(entry.title, "Term 2 begins");
      assert.equal(entry.kind, "term");
      assert.equal(entry.startDate.toISOString(), "2027-05-03T00:00:00.000Z");
      assert.equal(entry.description, null);
    }
  });

  it("refuses a missing title, a wrong kind, a missing or backwards date", () => {
    assert.ok("error" in parseCalendarEntry({ title: "x", kind: "term", startDate: "2027-01-01" }));
    assert.ok("error" in parseCalendarEntry({ title: "Exam week", kind: "party", startDate: "2027-01-01" }));
    assert.ok("error" in parseCalendarEntry({ title: "Exam week", kind: "assessment" }));
    assert.ok("error" in parseCalendarEntry({ title: "Exam week", kind: "assessment", startDate: "not a date" }));
    assert.ok("error" in parseCalendarEntry({ title: "Exam week", kind: "assessment", startDate: "2027-03-10", endDate: "2027-03-01" }));
  });

  it("groups rows by month in date order and reports a span that covers a day", () => {
    const rows = [
      { id: "b", startDate: "2027-02-10T00:00:00Z" },
      { id: "a", startDate: "2027-01-20T00:00:00Z", endDate: "2027-02-02T00:00:00Z" },
      { id: "c", startDate: "2027-02-01T00:00:00Z" },
    ];
    const months = groupByMonth(rows);
    assert.deepEqual(months.map((month) => month.key), ["2027-01", "2027-02"]);
    assert.deepEqual(months[1].rows.map((row) => row.id), ["c", "b"]);
    assert.equal(coversDay(rows[1], new Date("2027-02-01T12:00:00Z")), true);
    assert.equal(coversDay(rows[1], new Date("2027-02-05T12:00:00Z")), false);
  });
});

describe("online session links", () => {
  const instructional = { role: "trainer", trainerType: "instructional" };
  const inHouse = { role: "trainer", trainerType: "in_house" };

  it("only passes http and https links", () => {
    assert.equal(safeLink(""), null);
    assert.equal(safeLink("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
    assert.equal(safeLink("javascript:alert(1)"), "invalid");
    assert.equal(safeLink("data:text/html,x"), "invalid");
    assert.equal(safeLink("meet.google.com/abc"), "invalid");
  });

  it("keeps an instructional Trainer's links and refuses an in-house Trainer's", () => {
    const body = { meetingUrl: "https://meet.google.com/abc", videoUrl: "", materialsUrl: "https://drive.google.com/x" };
    const ok = parseOnlineFields(body, instructional);
    assert.ok(!("error" in ok) && ok.meetingUrl === "https://meet.google.com/abc" && ok.videoUrl === null);
    const refused = parseOnlineFields(body, inHouse);
    assert.ok("error" in refused && /instructional/.test(refused.error));
  });

  it("lets an in-house Trainer schedule a plain session with no links", () => {
    const plain = parseOnlineFields({}, inHouse);
    assert.deepEqual(plain, { meetingUrl: null, videoUrl: null, materialsUrl: null });
  });

  it("refuses a script address even from an instructional Trainer", () => {
    assert.ok("error" in parseOnlineFields({ meetingUrl: "javascript:alert(1)" }, instructional));
  });
});
