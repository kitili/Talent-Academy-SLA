/**
 * The workflow walkthrough: an Admin lets a Trainer and Fellows in, the Trainer does the Trainer's work, and the
 * Fellows see it. The security checks at the end try what each desk must be refused.
 *
 * It drives a running server over HTTP, so it needs a database. Point it at a THROWAWAY database only: it registers
 * people, makes a cohort and writes calendar rows. Never run it against the live academy database.
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:8765 npx tsx scripts/workflow-walkthrough.ts
 */
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8765";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: the walkthrough writes rows and runs on a local server only.`);
  process.exit(2);
}

type Reply = { status: number; json: any };
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
}

/** One signed-in (or signed-out) person: its own cookie jar. */
class Person {
  private cookie = "";
  constructor(public label: string) {}

  async call(method: string, path: string, body?: unknown): Promise<Reply> {
    // The server marks its session cookie Secure in production; this says the request came in over https.
    const headers: Record<string, string> = { "X-Forwarded-Proto": "https" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) {
      const jar = new Map(this.cookie.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0], pair] as const));
      for (const line of set) {
        const pair = line.split(";")[0];
        jar.set(pair.split("=")[0], pair);
      }
      this.cookie = Array.from(jar.values()).join("; ");
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }
  get = (path: string) => this.call("GET", path);
  post = (path: string, body?: unknown) => this.call("POST", path, body ?? {});
  patch = (path: string, body?: unknown) => this.call("PATCH", path, body ?? {});
  put = (path: string, body?: unknown) => this.call("PUT", path, body ?? {});
  del = (path: string) => this.call("DELETE", path);
  signIn = (username: string, password: string, role: string) => this.call("POST", "/api/login", { username, password, role });
}

const stamp = Date.now().toString(36);
const names = {
  trainerUser: `wt-trainer-${stamp}`,
  trainerEmail: `wt-trainer-${stamp}@example.com`,
  otherUser: `wt-other-${stamp}`,
  otherEmail: `wt-other-${stamp}@example.com`,
  fellowAUser: `WT-FellowA-${stamp}`,
  fellowAEmail: `wt-fellow-a-${stamp}@example.com`,
  fellowBUser: `wt-fellow-b-${stamp}`,
  fellowBEmail: `wt-fellow-b-${stamp}@example.com`,
};
const PASSWORD = "walk-through-1";
const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
const later = new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString();

async function main() {
  const anon = new Person("anonymous");
  const admin = new Person("admin");
  const trainer = new Person("instructional trainer");
  const other = new Person("other trainer");
  const fellowA = new Person("fellow A");
  const fellowB = new Person("fellow B");

  // ── 1. Admin signs in ────────────────────────────────────────────────────
  const adminIn = await admin.signIn("admin", "admin123", "admin");
  check("Admin signs in", adminIn.status === 200 && adminIn.json?.role === "admin", JSON.stringify(adminIn.json));

  // ── 2. Requests: an instructional Trainer, a second Trainer, a pre-service Fellow ─────
  const reqTrainer = await anon.post("/api/access-requests", { name: "Walk Trainer", username: names.trainerUser, email: names.trainerEmail, role: "trainer", type: "instructional" });
  const reqOther = await anon.post("/api/access-requests", { name: "Other Trainer", username: names.otherUser, email: names.otherEmail, role: "trainer" });
  const reqFellow = await anon.post("/api/access-requests", { name: "Walk Fellow", username: names.fellowAUser, email: names.fellowAEmail, role: "teacher", type: "pre_service" });
  check("Three requests are saved as pending", [reqTrainer, reqOther, reqFellow].every((r) => r.status === 201 && r.json?.status === "pending"), JSON.stringify([reqTrainer.json, reqOther.json, reqFellow.json]));
  const badKind = await anon.post("/api/access-requests", { name: "Wrong Kind", username: `wt-bad-${stamp}`, email: `bad-${stamp}@example.com`, role: "teacher", type: "instructional" });
  check("A Trainer kind on a Fellow request is refused", badKind.status === 400, JSON.stringify(badKind.json));

  const pendingSignIn = await anon.signIn(names.trainerUser, PASSWORD, "trainer");
  check("A pending person cannot sign in and is told an Admin must approve", pendingSignIn.status === 403 && /admin/i.test(pendingSignIn.json?.message || ""), JSON.stringify(pendingSignIn));

  // ── 3. Admin approves ────────────────────────────────────────────────────
  const pendingTrainers = (await admin.get("/api/admin/pending-trainers")).json || [];
  const pendingFellows = (await admin.get("/api/admin/pending-teachers")).json || [];
  const trainerRow = pendingTrainers.find((row: any) => row.username === names.trainerUser);
  const otherRow = pendingTrainers.find((row: any) => row.username === names.otherUser);
  const fellowRow = pendingFellows.find((row: any) => row.email === names.fellowAEmail);
  check("Admin sees the three requests waiting", Boolean(trainerRow && otherRow && fellowRow));
  check("The requested kinds were stored", trainerRow?.trainerType === "instructional" && fellowRow?.fellowType === "pre_service", JSON.stringify({ t: trainerRow?.trainerType, f: fellowRow?.fellowType }));
  for (const row of [trainerRow, otherRow]) await admin.post(`/api/admin/approve-trainer/${row?.id}`);
  await admin.post(`/api/admin/approve-teacher/${fellowRow?.id}`);

  // ── 4. The bug: approved, then create a password, then sign in with it ───────────────
  const beforePassword = await anon.signIn(names.fellowAUser, PASSWORD, "teacher");
  check("Approved but no password yet: sign-in says create your password", beforePassword.status === 403 && beforePassword.json?.code === "needs_password", JSON.stringify(beforePassword));
  for (const [identifier, role] of [[names.trainerUser, "trainer"], [names.otherUser, "trainer"], [names.fellowAUser, "teacher"]] as const) {
    const saved = await anon.post("/api/access-requests/password", { identifier, role, password: `  ${PASSWORD}  ` });
    check(`Password saved for ${identifier}`, saved.status === 200, JSON.stringify(saved));
  }
  const fellowByName = await fellowA.signIn(names.fellowAUser.toLowerCase(), PASSWORD, "teacher");
  check("Fellow signs in with the username they chose, in other capitals", fellowByName.status === 200 && fellowByName.json?.role === "teacher", JSON.stringify(fellowByName));
  const fellowAgain = await new Person("fellow A again").signIn(names.fellowAEmail.toUpperCase(), PASSWORD, "teacher");
  check("Fellow signs in with their email in capitals", fellowAgain.status === 200, JSON.stringify(fellowAgain));
  const trainerIn = await trainer.signIn(names.trainerUser.toUpperCase(), PASSWORD, "trainer");
  const otherIn = await other.signIn(names.otherUser, PASSWORD, "trainer");
  check("Trainers sign in with the login they created", trainerIn.status === 200 && otherIn.status === 200, JSON.stringify([trainerIn.status, otherIn.status]));
  check("The instructional kind comes back on the Trainer's own record", (await trainer.get("/api/user")).json?.trainerType === "instructional");
  const wrong = await new Person("wrong").signIn(names.fellowAUser, "not-the-password", "teacher");
  check("A wrong password is refused", wrong.status === 401, JSON.stringify(wrong));

  // ── 5. Admin builds a cohort and gives it to the instructional Trainer ─────────────────
  const cohort = await admin.post("/api/batches", { name: `Walkthrough cohort ${stamp}` });
  const cohortId = cohort.json?.id;
  check("Admin creates a cohort", cohort.status === 201 || cohort.status === 200 ? Boolean(cohortId) : false, JSON.stringify(cohort));
  const assigned = await admin.put(`/api/admin/academy-path/cohorts/${cohortId}/trainers`, { trainerIds: [trainerRow?.id] });
  check("Admin assigns the cohort to the instructional Trainer", assigned.status === 200, JSON.stringify(assigned));
  const myCohorts = (await trainer.get("/api/batches")).json || [];
  check("The Trainer sees only their cohort", myCohorts.some((b: any) => b.id === cohortId), JSON.stringify(myCohorts.map((b: any) => b.name)));
  check("The other Trainer sees no cohort", ((await other.get("/api/batches")).json || []).every((b: any) => b.id !== cohortId));

  // ── 6. The Trainer registers a Fellow, and enrols the one who requested ───────────────
  const regB = await trainer.post("/api/trainer/fellows", { name: "Walk Fellow B", username: names.fellowBUser, email: names.fellowBEmail, fellowType: "in_house", batchId: cohortId });
  const fellowBId = regB.json?.fellow?.id;
  check("Trainer registers an in-house Fellow into the cohort", regB.status === 201 && Boolean(fellowBId), JSON.stringify(regB));
  check("The registration reply holds no password hash", regB.json?.fellow && !("password" in regB.json.fellow));
  const dupe = await trainer.post("/api/trainer/fellows", { name: "Dupe", username: names.fellowBUser, email: `dupe-${stamp}@example.com`, batchId: cohortId });
  check("A duplicate username is refused", dupe.status === 409, JSON.stringify(dupe));
  const foreign = await other.post("/api/trainer/fellows", { name: "Foreign", username: `wt-foreign-${stamp}`, email: `foreign-${stamp}@example.com`, batchId: cohortId });
  check("A Trainer cannot register into a cohort that is not theirs", foreign.status === 403, JSON.stringify(foreign));
  const enrol = await trainer.post(`/api/batches/${cohortId}/teachers`, { teacherEmail: names.fellowAEmail });
  check("Trainer enrols the approved Fellow A", enrol.status === 200 || enrol.status === 201, JSON.stringify(enrol));
  const bBefore = await anon.signIn(names.fellowBUser, PASSWORD, "teacher");
  check("A registered Fellow is told to create a password first", bBefore.status === 403 && bBefore.json?.code === "needs_password", JSON.stringify(bBefore));
  await anon.post("/api/access-requests/password", { identifier: names.fellowBUser, role: "teacher", password: PASSWORD });
  const bIn = await fellowB.signIn(names.fellowBUser, PASSWORD, "teacher");
  check("The registered Fellow signs in after creating a password", bIn.status === 200, JSON.stringify(bIn));
  const roster = (await trainer.get(`/api/batches/${cohortId}`)).json;
  check("The cohort holds both Fellows", (roster?.teachers || []).length === 2, JSON.stringify((roster?.teachers || []).map((t: any) => t.name)));
  check("The cohort roster holds no password hashes", (roster?.teachers || []).every((t: any) => !("password" in t)));
  const tList = (await trainer.get("/api/trainer/fellows")).json || [];
  check("The Trainer's Fellow list shows both kinds", tList.some((f: any) => f.fellowType === "pre_service") && tList.some((f: any) => f.fellowType === "in_house"), JSON.stringify(tList.map((f: any) => f.fellowType)));
  const retype = await trainer.patch(`/api/trainer/fellows/${fellowBId}/type`, { fellowType: "pre_service" });
  check("Trainer can change their Fellow's kind", retype.status === 200 && retype.json?.fellowType === "pre_service", JSON.stringify(retype));
  const retypeBad = await trainer.patch(`/api/trainer/fellows/${fellowBId}/type`, { fellowType: "instructional" });
  check("A Trainer kind is refused for a Fellow", retypeBad.status === 400);

  // ── 7. Sessions: the timetable reaches Admin, Trainer and Fellows ──────────────────────
  const session = await trainer.post(`/api/batches/${cohortId}/events`, { title: "Online phonics", eventType: "session", startDate: soon, endDate: later, meetingUrl: "https://meet.google.com/abc-defg-hij", materialsUrl: "https://drive.google.com/file/d/1" });
  check("An instructional Trainer schedules an online session", session.status === 200 && session.json?.meetingUrl === "https://meet.google.com/abc-defg-hij", JSON.stringify(session));
  const scriptLink = await trainer.post(`/api/batches/${cohortId}/events`, { title: "Bad link", eventType: "session", startDate: soon, meetingUrl: "javascript:alert(1)" });
  check("A script address is refused as a meeting link", scriptLink.status === 400, JSON.stringify(scriptLink));
  const badDate = await trainer.post(`/api/batches/${cohortId}/events`, { title: "No date", eventType: "session", startDate: "tomorrow-ish" });
  check("A date that is not a date is refused", badDate.status === 400, JSON.stringify(badDate));
  const backwards = await trainer.post(`/api/batches/${cohortId}/events`, { title: "Backwards", eventType: "session", startDate: later, endDate: soon });
  check("A session that ends before it starts is refused", backwards.status === 400);
  await admin.patch(`/api/admin/trainers/${trainerRow?.id}/type`, { trainerType: "in_house" });
  const inHouseLink = await trainer.post(`/api/batches/${cohortId}/events`, { title: "In-house link", eventType: "session", startDate: soon, meetingUrl: "https://meet.google.com/zzz" });
  check("When the Trainer is in-house, a meeting link is refused", inHouseLink.status === 403, JSON.stringify(inHouseLink));
  const plain = await trainer.post(`/api/batches/${cohortId}/events`, { title: "Plain session", eventType: "session", startDate: soon });
  check("An in-house Trainer can still schedule a plain session", plain.status === 200, JSON.stringify(plain));
  await admin.patch(`/api/admin/trainers/${trainerRow?.id}/type`, { trainerType: "instructional" });
  const fellowTable = (await fellowA.get("/api/timetable")).json || [];
  const trainerTable = (await trainer.get("/api/timetable")).json || [];
  const adminTable = (await admin.get("/api/timetable")).json || [];
  const otherTable = (await other.get("/api/timetable")).json || [];
  check("The Fellow's timetable shows the online session with its link", fellowTable.some((e: any) => e.title === "Online phonics" && e.meetingUrl), JSON.stringify(fellowTable.map((e: any) => e.title)));
  check("The Trainer's timetable shows it", trainerTable.some((e: any) => e.title === "Online phonics"));
  check("The Admin's high-level timetable shows it with the cohort and Trainer", adminTable.some((e: any) => e.title === "Online phonics" && e.cohortName && e.trainerName), JSON.stringify(adminTable[0]));
  check("The other Trainer's timetable does not show it", otherTable.every((e: any) => e.title !== "Online phonics"));
  const outsider = await new Person("outsider").get("/api/timetable");
  check("The timetable is closed to a signed-out visitor", outsider.status === 401);

  // ── 8. The annual calendar: Admin writes, everyone else reads ───────────────────────────
  const entry = await admin.post("/api/admin/academy-calendar", { title: "Term 2 begins", kind: "term", startDate: "2027-05-03", endDate: "2027-08-06" });
  check("Admin adds to the academy year", entry.status === 201 && Boolean(entry.json?.id), JSON.stringify(entry));
  const badEntry = await admin.post("/api/admin/academy-calendar", { title: "x", kind: "term", startDate: "2027-05-03" });
  check("An entry with no real title is refused", badEntry.status === 400);
  const draftForTrainer = (await trainer.get("/api/academy-calendar")).json || [];
  check("A draft is hidden from the Trainer", !draftForTrainer.some((e: any) => e.id === entry.json?.id));
  check("The Admin sees the draft", ((await admin.get("/api/academy-calendar")).json || []).some((e: any) => e.id === entry.json?.id && !e.publishedAt));
  check("A Trainer cannot press Done", (await trainer.post("/api/admin/academy-calendar/publish", {})).status === 403);
  const done = await admin.post("/api/admin/academy-calendar/publish", {});
  check("Admin presses Done", done.status === 200 && done.json?.published >= 1, JSON.stringify(done.json));
  const seenByTrainer = (await trainer.get("/api/academy-calendar")).json || [];
  const seenByFellow = (await fellowB.get("/api/academy-calendar")).json || [];
  check("The Trainer sees the entry without anyone sending it", seenByTrainer.some((e: any) => e.title === "Term 2 begins"));
  check("The Fellow sees the entry too", seenByFellow.some((e: any) => e.title === "Term 2 begins"));
  const trainerWrite = await trainer.post("/api/admin/academy-calendar", { title: "Sneaky", kind: "event", startDate: "2027-01-01" });
  const fellowWrite = await fellowA.post("/api/admin/academy-calendar", { title: "Sneaky", kind: "event", startDate: "2027-01-01" });
  const fellowDelete = await fellowA.del(`/api/admin/academy-calendar/${entry.json?.id}`);
  check("A Trainer cannot write the academy year", trainerWrite.status === 403, String(trainerWrite.status));
  check("A Fellow cannot write or delete the academy year", fellowWrite.status === 403 || fellowWrite.status === 401, `${fellowWrite.status}/${fellowDelete.status}`);
  check("A signed-out visitor cannot read the academy year", (await anon.get("/api/academy-calendar")).status === 401);

  // ── 9. Assessments: shared with named Fellows, seen by them alone ─────────────────────
  const fellowAId = ((await trainer.get(`/api/batches/${cohortId}`)).json?.teachers || []).find((t: any) => t.email === names.fellowAEmail)?.id;
  const shared = await trainer.post(`/api/batches/${cohortId}/assignments`, { title: "Reading assessment", instructions: "Read the passage and answer.", kind: "assessment", teacherIds: [fellowAId] });
  check("Trainer shares an assessment with one named Fellow", shared.status === 201 && (shared.json?.teacherIds || []).length === 1, JSON.stringify(shared));
  const toEveryone = await trainer.post(`/api/batches/${cohortId}/assignments`, { title: "Whole-cohort assessment", instructions: "For all.", kind: "assessment" });
  check("Trainer shares another with the whole cohort", toEveryone.status === 201);
  const outsideAudience = await trainer.post(`/api/batches/${cohortId}/assignments`, { title: "Wrong names", instructions: "x", kind: "assessment", teacherIds: ["00000000-0000-0000-0000-000000000000"] });
  check("A Fellow outside the cohort cannot be named", outsideAudience.status === 400, JSON.stringify(outsideAudience));
  const aWork = (await fellowA.get("/api/teacher/assignments")).json || [];
  const bWork = (await fellowB.get("/api/teacher/assignments")).json || [];
  check("Fellow A sees both assessments", aWork.some((w: any) => w.title === "Reading assessment") && aWork.some((w: any) => w.title === "Whole-cohort assessment"), JSON.stringify(aWork.map((w: any) => w.title)));
  check("Fellow B sees only the whole-cohort one", bWork.every((w: any) => w.title !== "Reading assessment") && bWork.some((w: any) => w.title === "Whole-cohort assessment"), JSON.stringify(bWork.map((w: any) => w.title)));
  const sharedId = shared.json?.id;
  const bSubmit = await fellowB.post(`/api/teacher/assignments/${sharedId}/submit`, { response: "I was not asked" });
  check("Fellow B cannot answer work that was not shared with them", bSubmit.status === 403, JSON.stringify(bSubmit));
  const aSubmit = await fellowA.post(`/api/teacher/assignments/${sharedId}/submit`, { response: "My answer" });
  check("Fellow A answers the work shared with them", aSubmit.status === 200, JSON.stringify(aSubmit));
  const submissions = (await trainer.get(`/api/batches/${cohortId}/assignments/${sharedId}/submissions`)).json || [];
  check("The Trainer reads Fellow A's answer", Array.isArray(submissions) && submissions.some((s: any) => s.response === "My answer"), JSON.stringify(submissions));
  const otherTouch = await other.post(`/api/batches/${cohortId}/assignments`, { title: "Not mine", instructions: "x", kind: "assessment" });
  check("The other Trainer cannot assign work in this cohort", otherTouch.status === 403, JSON.stringify(otherTouch));

  // ── 10. Security: what each desk must be refused ────────────────────────────────────────
  const closed: Array<[string, Person, string, string, number[]]> = [
    ["a Fellow cannot register Fellows", fellowA, "post", "/api/trainer/fellows", [401, 403]],
    ["a Fellow cannot list the Trainer's Fellows", fellowA, "get", "/api/trainer/fellows", [401, 403]],
    ["a signed-out visitor cannot register Fellows", anon, "post", "/api/trainer/fellows", [401]],
    ["a Trainer cannot change a Trainer's kind", trainer, "patch", `/api/admin/trainers/${trainerRow?.id}/type`, [403]],
    ["the other Trainer cannot list this cohort's sessions", other, "get", `/api/batches/${cohortId}/events`, [403]],
    ["the other Trainer cannot open this cohort", other, "get", `/api/batches/${cohortId}`, [403]],
    ["a Fellow cannot open a cohort's roster", fellowA, "get", `/api/batches/${cohortId}`, [401, 403]],
    ["a Fellow cannot create sessions", fellowA, "post", `/api/batches/${cohortId}/events`, [401, 403]],
    ["a signed-out visitor cannot read the pending list", anon, "get", "/api/admin/pending-teachers", [401, 403]],
    ["a Trainer cannot read the pending list", trainer, "get", "/api/admin/pending-teachers", [403]],
  ];
  for (const [name, who, method, path, allowed] of closed) {
    const reply = await who.call(method.toUpperCase(), path, method === "get" ? undefined : {});
    check(`Refused: ${name}`, allowed.includes(reply.status), `status ${reply.status}`);
  }
  const sessionId = session.json?.id;
  const otherDelete = await other.del(`/api/events/${sessionId}`);
  check("Refused: the other Trainer cannot delete this cohort's session", otherDelete.status === 403, `status ${otherDelete.status}`);
  const trainerDetail = await admin.get(`/api/admin/trainers/${trainerRow?.id}`);
  check("The Trainer detail leaks neither password nor reset token", trainerDetail.json && !("password" in trainerDetail.json) && !("resetToken" in trainerDetail.json));
  const fellowRecord = await fellowA.get("/api/user");
  check("A Fellow's own record holds no password", fellowRecord.json && !("password" in fellowRecord.json));
  const injection = await anon.signIn("' OR '1'='1", "x", "teacher");
  check("An injection-shaped name is just a wrong login", injection.status === 401, `status ${injection.status}`);
  const html = await trainer.post(`/api/batches/${cohortId}/events`, { title: "<img src=x onerror=alert(1)>", eventType: "session", startDate: soon });
  const stored = ((await fellowA.get("/api/timetable")).json || []).find((e: any) => e.id === html.json?.id);
  check("A script in a title is stored as plain text (the pages print it escaped)", html.status === 200 && stored?.title === "<img src=x onerror=alert(1)>");
  // ── 11. Round 2: names, marking, deadlines, editing, the year's Done, courses, uploads, figures ───────────
  const givenTo = ((await trainer.get(`/api/batches/${cohortId}/assignments`)).json || []).find((w: any) => w.id === sharedId);
  check("The assessment list names who sits it", givenTo?.audience?.length === 1 && givenTo.audience[0].name === "Walk Fellow", JSON.stringify(givenTo?.audience));
  const everyoneRoster = (await trainer.get(`/api/batches/${cohortId}/assignments/${toEveryone.json?.id}/submissions`)).json || [];
  check("Marking lists the Fellows still to submit", Array.isArray(everyoneRoster) && everyoneRoster.filter((row: any) => row.submitted === false).length === 2, JSON.stringify(everyoneRoster));

  const cohort2 = await admin.post("/api/batches", { name: `Walkthrough cohort two ${stamp}` });
  await admin.put(`/api/admin/academy-path/cohorts/${cohort2.json?.id}/trainers`, { trainerIds: [otherRow?.id] });
  const crossRead = await other.get(`/api/batches/${cohort2.json?.id}/assignments/${sharedId}/submissions`);
  const crossMark = await other.patch(`/api/batches/${cohort2.json?.id}/assignments/${sharedId}/submissions/${fellowAId}`, { trainerScore: 0, trainerComment: "x" });
  check("A Trainer cannot read another cohort's answers through their own cohort", crossRead.status === 404, JSON.stringify(crossRead));
  check("A Trainer cannot mark another cohort's answers through their own cohort", crossMark.status === 404, JSON.stringify(crossMark));

  const past = new Date(Date.now() - 3_600_000).toISOString();
  const late = await trainer.post(`/api/batches/${cohortId}/assignments`, { title: "Already closed", instructions: "x", kind: "assessment", dueDate: past });
  check("Work past its deadline is not on the Fellow's list", !((await fellowB.get("/api/teacher/assignments")).json || []).some((w: any) => w.id === late.json?.id));
  const lateAnswer = await fellowB.post(`/api/teacher/assignments/${late.json?.id}/submit`, { response: "too late" });
  check("An answer after the deadline is refused", lateAnswer.status === 410, JSON.stringify(lateAnswer));
  const closing = await trainer.post(`/api/batches/${cohortId}/assignments`, { title: "Handed in before it closed", instructions: "x", kind: "assessment", dueDate: soon });
  await fellowB.post(`/api/teacher/assignments/${closing.json?.id}/submit`, { response: "on time" });
  await trainer.patch(`/api/batches/${cohortId}/assignments/${closing.json?.id}`, { dueDate: past });
  check("Work handed in stays on the Fellow's list after the deadline", ((await fellowB.get("/api/teacher/assignments")).json || []).some((w: any) => w.id === closing.json?.id));
  check("...but cannot be answered again", (await fellowB.post(`/api/teacher/assignments/${closing.json?.id}/submit`, { response: "again" })).status === 410);

  const moved = await trainer.patch(`/api/events/${sessionId}`, { title: "Online phonics (moved)", eventType: "session", startDate: soon, endDate: later, meetingUrl: "https://meet.google.com/abc-defg-hij" });
  check("The Trainer edits their session", moved.status === 200 && moved.json?.title === "Online phonics (moved)", JSON.stringify(moved));
  check("The Fellow sees the edited session", ((await fellowA.get("/api/timetable")).json || []).some((e: any) => e.title === "Online phonics (moved)"));
  check("The other Trainer cannot edit it", (await other.patch(`/api/events/${sessionId}`, { title: "Mine now", eventType: "session", startDate: soon })).status === 403);
  const byAdmin = await admin.patch(`/api/events/${sessionId}`, { title: "Online phonics (Admin)", eventType: "session", startDate: soon, endDate: later, meetingUrl: "https://meet.google.com/abc-defg-hij" });
  check("The Admin edits the Trainer's session", byAdmin.status === 200, JSON.stringify(byAdmin));
  await admin.patch(`/api/admin/trainers/${trainerRow?.id}/type`, { trainerType: "in_house" });
  const inHouseEdit = await trainer.patch(`/api/events/${sessionId}`, { title: "Online phonics (in-house edit)", eventType: "session", startDate: soon, endDate: later });
  check("An in-house Trainer can move a session and its link is kept", inHouseEdit.status === 200 && inHouseEdit.json?.meetingUrl === "https://meet.google.com/abc-defg-hij", JSON.stringify(inHouseEdit.json));
  await admin.patch(`/api/admin/trainers/${trainerRow?.id}/type`, { trainerType: "instructional" });

  const course = await trainer.post("/api/trainer/courses", { name: `Walk course ${stamp}`, cohortId });
  check("A Trainer makes a course on their cohort", course.status === 201, JSON.stringify(course));
  const myCourses = (await trainer.get("/api/trainer/courses")).json || [];
  check("The course is on the Trainer's Courses page, on the cohort", myCourses.some((c: any) => c.id === course.json?.id && c.mine && c.cohorts.some((b: any) => b.id === cohortId)), JSON.stringify(myCourses));
  check("The Trainer renames their course", (await trainer.patch(`/api/courses/${course.json?.id}`, { name: `Walk course renamed ${stamp}` })).status === 200);
  check("The other Trainer cannot edit it", (await other.patch(`/api/courses/${course.json?.id}`, { name: "Mine" })).status === 403);
  check("The Trainer cannot delete a course", (await trainer.del(`/api/courses/${course.json?.id}`)).status === 403);
  check("The other Trainer cannot put it on their cohort", (await other.post(`/api/trainer/courses/${course.json?.id}/cohorts`, { cohortId: cohort2.json?.id })).status === 403);
  check("A Trainer cannot place a course on a cohort they do not teach", (await trainer.post("/api/trainer/courses", { name: `Elsewhere ${stamp}`, cohortId: cohort2.json?.id })).status === 403);
  const module = await trainer.post("/api/training-weeks", { courseId: course.json?.id, title: "Module one", weekNumber: 1 });
  check("The Trainer adds a module to their course", module.status === 200 || module.status === 201, JSON.stringify(module));

  check("Without a Blob token uploads go through the server", (await trainer.get("/api/objects/upload-mode")).json?.direct === false);
  check("The Blob signer is off without a token", (await trainer.post("/api/blob-upload", {})).status === 503);

  const stats = (await admin.get("/api/admin/dashboard-stats")).json || {};
  check("Admin Home counts kinds, sessions and answers to mark", stats.fellowKinds?.pre_service >= 1 && stats.trainerKinds?.instructional >= 1 && stats.answersToMark >= 1 && typeof stats.sessionsNextSevenDays === "number", JSON.stringify(stats));
  const deskFigures = (await trainer.get("/api/trainer/desk")).json || {};
  check("The Trainer's figures count uploaded assessments and answers to mark", deskFigures.assessments >= 2 && deskFigures.toMark >= 1, JSON.stringify({ a: deskFigures.assessments, m: deskFigures.toMark }));
  const pipeline = (await admin.get("/api/admin/analytics/pipeline")).json || {};
  check("Participation counts Fellows active in the last 30 days", pipeline.activeLast30Days >= 2 && pipeline.enrolled >= 2, JSON.stringify(pipeline));

  await trainer.del(`/api/events/${sessionId}`);
  check("The owning Trainer can remove their session", ((await trainer.get("/api/timetable")).json || []).every((e: any) => e.id !== sessionId));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("Failed:");
    for (const item of failed) console.log(` - ${item.name}: ${item.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Walkthrough stopped:", error);
  process.exit(1);
});
