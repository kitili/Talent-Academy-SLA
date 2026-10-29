/**
 * Demo academy: accounts, a cohort, courses, sessions, the academy year, assessments and exams, then the work done as
 * each desk would do it. Everything is named "Demo" so it is easy to spot, and `remove` takes it away again.
 *
 * It drives a running server over HTTP, through the same routes and rules as the pages; it never opens the database.
 *
 *   DEMO_BASE_URL=https://talent-academy-sla.vercel.app \
 *   DEMO_ADMIN_IDENTIFIER=... DEMO_ADMIN_PASSWORD=... \
 *   npx tsx scripts/demo-academy.ts seed      # or: remove
 *
 * The password for the demo accounts comes from DEMO_PASSWORD, or is generated. The accounts and password are written
 * to demo-accounts.local.md (git ignores it); nothing secret is printed.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = (process.env.DEMO_BASE_URL || "").replace(/\/$/, "");
const ADMIN_ID = process.env.DEMO_ADMIN_IDENTIFIER || "";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "";
const MODE = process.argv[2];
const PREFIX = "Demo";
const ACCOUNTS_FILE = "demo-accounts.local.md";
// Removing the demo makes its people inactive, so their emails stay taken. A rerun after `remove` sets DEMO_EMAIL_TAG
// (for example 2) and gets demo.fellow.amina+2@example.com and so on.
const TAG = (process.env.DEMO_EMAIL_TAG || "").replace(/[^a-z0-9]/gi, "");
const mail = (local: string) => `${local}${TAG ? `+${TAG}` : ""}@example.com`;

if (!BASE || !ADMIN_ID || !ADMIN_PASSWORD || !["seed", "remove"].includes(MODE || "")) {
  console.error("Set DEMO_BASE_URL, DEMO_ADMIN_IDENTIFIER and DEMO_ADMIN_PASSWORD, and run with seed or remove.");
  process.exit(2);
}
const secure = BASE.startsWith("https://");

type Reply = { status: number; json: any };
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -> ${detail.slice(0, 300)}`}`);
  return ok;
}

class Person {
  private cookie = "";
  constructor(public label: string) {}
  async call(method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (!secure) headers["X-Forwarded-Proto"] = "https";
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) {
      const jar = new Map(this.cookie.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0], pair] as const));
      for (const line of set) jar.set(line.split(";")[0].split("=")[0], line.split(";")[0]);
      this.cookie = Array.from(jar.values()).join("; ");
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  }
  get = (path: string) => this.call("GET", path);
  post = (path: string, body: unknown = {}) => this.call("POST", path, body);
  patch = (path: string, body: unknown = {}) => this.call("PATCH", path, body);
  put = (path: string, body: unknown = {}) => this.call("PUT", path, body);
  del = (path: string) => this.call("DELETE", path);
  signIn = (username: string, password: string, role: string) => this.call("POST", "/api/login", { username, password, role });
}

const ok2xx = (reply: Reply) => reply.status >= 200 && reply.status < 300;
const day = 86_400_000;
/** A local time in Dar es Salaam (UTC+3) `days` from today, as an instant. */
function eat(days: number, hour: number, minute = 0) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * day;
  return new Date(base + (hour - 3) * 3_600_000 + minute * 60_000).toISOString();
}
const dateOnly = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10);

const ACCOUNTS = {
  admin: { name: "Demo Admin", email: mail("demo.admin"), role: "admin" },
  instructional: { name: "Demo Neema Mushi", email: mail("demo.trainer.instructional"), role: "trainer", kind: "instructional" },
  inHouse: { name: "Demo Peter Kimaro", email: mail("demo.trainer.inhouse"), role: "trainer", kind: "in_house" },
  fellows: [
    { name: "Demo Amina Juma", email: mail("demo.fellow.amina"), kind: "in_house" },
    { name: "Demo Baraka Mollel", email: mail("demo.fellow.baraka"), kind: "in_house" },
    { name: "Demo Zawadi Said", email: mail("demo.fellow.zawadi"), kind: "pre_service" },
    { name: "Demo Juma Ally", email: mail("demo.fellow.juma"), kind: "pre_service" },
  ],
};

async function seed() {
  const password = process.env.DEMO_PASSWORD || `Demo-${randomBytes(6).toString("base64url")}`;
  const admin = new Person("admin");
  check("Admin signs in", ok2xx(await admin.signIn(ADMIN_ID, ADMIN_PASSWORD, "admin")));

  const existing = ((await admin.get("/api/batches")).json || []) as any[];
  if (existing.some((batch) => String(batch.name).startsWith(PREFIX))) {
    console.error("A Demo cohort already exists. Run `remove` first.");
    process.exit(1);
  }

  // ── Accounts ────────────────────────────────────────────────────────────
  const create = async (person: { name: string; email: string; role: string }) => {
    const reply = await admin.post("/api/admin/users/create", { ...person, password });
    check(`Account for ${person.name}`, ok2xx(reply), JSON.stringify(reply.json));
    return reply.json;
  };
  await create(ACCOUNTS.admin);
  const instructional = await create(ACCOUNTS.instructional);
  const inHouse = await create(ACCOUNTS.inHouse);
  const fellows: any[] = [];
  for (const fellow of ACCOUNTS.fellows) fellows.push(await create({ ...fellow, role: "teacher" }));
  check("Instructional Trainer kind set", ok2xx(await admin.patch(`/api/admin/trainers/${instructional?.id}/type`, { trainerType: "instructional" })));

  // ── Cohort ──────────────────────────────────────────────────────────────
  const cohortReply = await admin.post("/api/batches", { name: `${PREFIX} cohort · Term 1 2027` });
  const cohortId = cohortReply.json?.id;
  check("Admin makes the Demo cohort", Boolean(cohortId), JSON.stringify(cohortReply.json));
  check("Both Trainers teach it", ok2xx(await admin.put(`/api/admin/academy-path/cohorts/${cohortId}/trainers`, { trainerIds: [instructional?.id, inHouse?.id] })));
  check("Four Fellows enrolled", ok2xx(await admin.put(`/api/admin/academy-path/cohorts/${cohortId}/teachers`, { teacherIds: fellows.map((f) => f?.id) })));

  const trainer = new Person("instructional trainer");
  check("Instructional Trainer signs in", ok2xx(await trainer.signIn(ACCOUNTS.instructional.email, password, "trainer")));
  for (const [index, fellow] of ACCOUNTS.fellows.entries()) {
    if (fellow.kind === "pre_service") await trainer.patch(`/api/trainer/fellows/${fellows[index]?.id}/type`, { fellowType: "pre_service" });
  }

  // ── Courses, modules and lessons ────────────────────────────────────────
  const lessons: Array<{ weekId: string; deckFileId: string }> = [];
  const courses = [
    { name: `${PREFIX} · Early literacy`, description: "Letter sounds, blending and first reading.", modules: [
      ["Letter sounds", "Say and recognise the 26 letter sounds.", "https://www.youtube.com/watch?v=BELlZKpi1Zs"],
      ["Blending sounds", "Blend three sounds into a word.", "https://www.youtube.com/watch?v=MrO8gBq0vS0"],
    ] },
    { name: `${PREFIX} · Numeracy`, description: "Counting, number bonds and early addition.", modules: [
      ["Counting to 20", "Count objects reliably to 20.", "https://www.youtube.com/watch?v=0TgLtF3PMOc"],
    ] },
  ];
  let firstWeekId = "";
  for (const course of courses) {
    const made = await trainer.post("/api/trainer/courses", { name: course.name, description: course.description, cohortId });
    check(`Trainer makes ${course.name} on the cohort`, made.status === 201, JSON.stringify(made.json));
    for (const [index, [focus, objective, video]] of course.modules.entries()) {
      const week = await trainer.post("/api/training-weeks", { courseId: made.json?.id, weekNumber: index + 1, competencyFocus: focus, objective });
      check(`Module ${focus}`, ok2xx(week), JSON.stringify(week.json));
      firstWeekId ||= week.json?.id;
      const lesson = await trainer.post(`/api/training-weeks/${week.json?.id}/external-link`, { url: video, title: `${focus} (video)` });
      check(`Video lesson in ${focus}`, lesson.status === 201, JSON.stringify(lesson.json));
      const file = (lesson.json?.deckFiles || []).at(-1);
      if (file) lessons.push({ weekId: week.json.id, deckFileId: file.id });
    }
  }

  // ── Sessions ────────────────────────────────────────────────────────────
  const sessions = [
    { title: `${PREFIX} · Phonics clinic (online)`, eventType: "session", startDate: eat(1, 9), endDate: eat(1, 10), meetingUrl: "https://meet.google.com/demo-phon-ics", materialsUrl: "https://drive.google.com/drive/folders/demo-phonics" },
    { title: `${PREFIX} · Classroom routines workshop`, eventType: "session", startDate: eat(3, 14), endDate: eat(3, 16) },
    { title: `${PREFIX} · Numeracy live lesson (online)`, eventType: "session", startDate: eat(7, 10), endDate: eat(7, 11), meetingUrl: "https://meet.google.com/demo-numb-ers" },
    { title: `${PREFIX} · Welcome session (recorded)`, eventType: "session", startDate: eat(-3, 9), endDate: eat(-3, 10), videoUrl: "https://www.youtube.com/watch?v=BELlZKpi1Zs" },
    { title: `${PREFIX} · Reading assessment week`, eventType: "assessment", startDate: eat(10, 8), endDate: eat(14, 16) },
  ];
  for (const session of sessions) {
    const made = await trainer.post(`/api/batches/${cohortId}/events`, session);
    check(`Session: ${session.title}`, ok2xx(made), JSON.stringify(made.json));
  }

  // ── Academy year (drafts, then Done) ────────────────────────────────────
  for (const entry of [
    { title: `${PREFIX} · Term 1 begins`, kind: "term", startDate: dateOnly(-7), endDate: dateOnly(80) },
    { title: `${PREFIX} · Mid-term break`, kind: "holiday", startDate: dateOnly(35), endDate: dateOnly(41) },
    { title: `${PREFIX} · Reading assessment week`, kind: "assessment", startDate: dateOnly(10), endDate: dateOnly(14) },
    { title: `${PREFIX} · Portfolios due`, kind: "deadline", startDate: dateOnly(60) },
  ]) {
    const made = await admin.post("/api/admin/academy-calendar", entry);
    check(`Academy year: ${entry.title}`, made.status === 201, JSON.stringify(made.json));
  }
  const done = await admin.post("/api/admin/academy-calendar/publish", {});
  check("Admin presses Done on the academy year", ok2xx(done) && done.json?.published >= 4, JSON.stringify(done.json));

  // ── Assessments and exams ───────────────────────────────────────────────
  const [amina, baraka, zawadi, juma] = fellows;
  const named = await trainer.post(`/api/batches/${cohortId}/assignments`, {
    title: `${PREFIX} · Reading check`, kind: "assessment", dueDate: eat(5, 17),
    instructions: "Listen to a child read the attached passage. Write what they read well and one next step.",
    teacherIds: [amina?.id, baraka?.id],
  });
  check("Assessment given to Amina and Baraka", named.status === 201, JSON.stringify(named.json));
  const whole = await trainer.post(`/api/batches/${cohortId}/assignments`, {
    title: `${PREFIX} · Lesson plan`, kind: "assessment", dueDate: eat(10, 17),
    instructions: "Plan one 30-minute phonics lesson: objective, warm-up, teaching, practice and check.",
  });
  check("Assessment given to the whole cohort", whole.status === 201, JSON.stringify(whole.json));
  const closed = await trainer.post(`/api/batches/${cohortId}/assignments`, {
    title: `${PREFIX} · Week 1 reflection (closed)`, kind: "assessment", dueDate: eat(-1, 17),
    instructions: "What went well in your first week?",
  });
  check("An assessment already past its deadline", closed.status === 201);

  const quizQuestions = [
    { question: "How many letter sounds does English phonics start with?", type: "multiple_choice", options: ["26", "44", "52", "10"], correctAnswer: "44" },
    { question: "Blending means joining sounds to read a word.", type: "true_false", options: ["True", "False"], correctAnswer: "True" },
    { question: "Which word is CVC?", type: "multiple_choice", options: ["cat", "train", "spring", "school"], correctAnswer: "cat" },
    { question: "Segmenting means splitting a word into its sounds.", type: "true_false", options: ["True", "False"], correctAnswer: "True" },
    { question: "Which comes first when teaching a new sound?", type: "multiple_choice", options: ["Say the sound", "Write a sentence", "Spell a long word", "Read a story alone"], correctAnswer: "Say the sound" },
  ];
  const quiz = await trainer.post(`/api/batches/${cohortId}/assign-quiz`, {
    weekId: firstWeekId, title: `${PREFIX} · Phonics check quiz`, description: "Five questions on the first module.",
    questions: quizQuestions, dueDate: eat(7, 17), passMark: 80,
  });
  check("Quiz with five questions, due in a week", quiz.status === 201, JSON.stringify(quiz.json));
  const exam = await trainer.post(`/api/batches/${cohortId}/open-exam`, {
    title: `${PREFIX} · Written exam: teaching reading`, dueDate: eat(6, 17),
    prompt: "Describe how you would teach a child who knows their letter sounds but cannot yet blend.",
  });
  check("Written exam, due in six days", exam.status === 201, JSON.stringify(exam.json));

  // ── The Fellows do the work ─────────────────────────────────────────────
  const desks = await Promise.all(ACCOUNTS.fellows.map(async (fellow) => {
    const desk = new Person(fellow.name);
    check(`${fellow.name} signs in`, ok2xx(await desk.signIn(fellow.email, password, "teacher")));
    return desk;
  }));
  const [aminaDesk, barakaDesk, zawadiDesk, jumaDesk] = desks;

  const aminaWork = ((await aminaDesk.get("/api/teacher/assignments")).json || []) as any[];
  check("Amina sees both open assessments and not the closed one",
    aminaWork.some((w) => w.id === named.json?.id) && aminaWork.some((w) => w.id === whole.json?.id) && !aminaWork.some((w) => w.id === closed.json?.id),
    JSON.stringify(aminaWork.map((w) => w.title)));
  const zawadiWork = ((await zawadiDesk.get("/api/teacher/assignments")).json || []) as any[];
  check("Zawadi does not see the assessment given to others", !zawadiWork.some((w) => w.id === named.json?.id));

  check("Amina hands in the reading check", ok2xx(await aminaDesk.post(`/api/teacher/assignments/${named.json?.id}/submit`, {
    response: "The child read all CVC words fluently and self-corrected 'pin'.\nNext step: practise blending four-sound words.",
  })));
  check("Baraka hands in the reading check", ok2xx(await barakaDesk.post(`/api/teacher/assignments/${named.json?.id}/submit`, {
    response: "Read 8 of 10 words. Mixed up b and d.\nNext step: daily b/d sorting game.",
  })));
  check("Zawadi hands in the lesson plan", ok2xx(await zawadiDesk.post(`/api/teacher/assignments/${whole.json?.id}/submit`, {
    response: "Objective: blend s-a-t.\nWarm-up: sound song (5 min).\nTeach: model blending (10 min).\nPractice: word cards in pairs (10 min).\nCheck: each child blends one word (5 min).",
  })));
  check("Juma's late answer is refused", (await jumaDesk.post(`/api/teacher/assignments/${closed.json?.id}/submit`, { response: "late" })).status === 410);

  const answers = (correct: boolean) => Object.fromEntries(((quiz.json?.questions || []) as any[]).map((q, index) =>
    [q.id, correct || index > 1 ? q.correctAnswer : q.options.find((option: string) => option !== q.correctAnswer)]));
  const aminaQuiz = await aminaDesk.post(`/api/assigned-quizzes/${quiz.json?.id}/submit`, { answers: answers(true) });
  check("Amina passes the quiz", ok2xx(aminaQuiz), JSON.stringify(aminaQuiz.json));
  const barakaQuiz = await barakaDesk.post(`/api/assigned-quizzes/${quiz.json?.id}/submit`, { answers: answers(false) });
  check("Baraka tries the quiz and has tries left", ok2xx(barakaQuiz), JSON.stringify(barakaQuiz.json));
  const juQuiz = await jumaDesk.get(`/api/assigned-quizzes/${quiz.json?.id}`);
  check("Juma can open the quiz", ok2xx(juQuiz));

  for (const lesson of lessons.slice(0, 2)) {
    await aminaDesk.post(`/api/teachers/weeks/${lesson.weekId}/content/${lesson.deckFileId}/viewed`, {});
  }
  check("Amina writes a reflection", ok2xx(await aminaDesk.post("/api/teacher/reflections", {
    weekId: lessons[0]?.weekId, batchId: cohortId, rating: 5,
    content: "The sound song worked well. I will slow down when modelling blending.",
  })));
  check("Amina sets a goal", ok2xx(await aminaDesk.post("/api/teacher/goals", { goalText: "Teach blending to my whole class by mid-term", batchId: cohortId, dueDate: dateOnly(35) })));
  check("Amina messages her Trainer", (await aminaDesk.post("/api/desk-messages", { toId: instructional?.id, toRole: "trainer", body: "Could you share the slides from the phonics clinic?" })).status === 201);

  // ── The Trainer marks, takes attendance and writes to the cohort ────────
  check("Trainer marks Amina's reading check", ok2xx(await trainer.patch(`/api/batches/${cohortId}/assignments/${named.json?.id}/submissions/${amina?.id}`, {
    trainerScore: 88, trainerComment: "Clear evidence and a precise next step.",
  })));
  const attendance = await trainer.post(`/api/batches/${cohortId}/attendance`, {
    date: dateOnly(0),
    records: [
      { teacherId: amina?.id, status: "present" }, { teacherId: baraka?.id, status: "present" },
      { teacherId: zawadi?.id, status: "late" }, { teacherId: juma?.id, status: "absent", notes: "Unwell" },
    ],
  });
  check("Trainer marks today's attendance for four Fellows", ok2xx(attendance) && attendance.json?.created === 4, JSON.stringify(attendance.json));
  check("Trainer announces to the cohort", ok2xx(await trainer.post(`/api/batches/${cohortId}/announce`, {
    title: "Welcome to Term 1", message: "Sessions are on your Calendar. Bring a reading book to the phonics clinic.",
  })));
  check("Trainer replies to Amina", (await trainer.post("/api/desk-messages", { toId: amina?.id, toRole: "teacher", body: "Yes, they are linked on the session as Materials." })).status === 201);

  // ── What each desk now sees ─────────────────────────────────────────────
  const timetable = ((await zawadiDesk.get("/api/timetable")).json || []) as any[];
  check("Fellows see the cohort's upcoming sessions", timetable.filter((s) => String(s.title).startsWith(PREFIX)).length >= 4, String(timetable.length));
  const year = ((await jumaDesk.get("/api/academy-calendar")).json || []) as any[];
  check("Fellows see the published academy year", year.filter((e) => String(e.title).startsWith(PREFIX)).length >= 4);
  const roster = ((await trainer.get(`/api/batches/${cohortId}/assignments/${named.json?.id}/submissions`)).json || []) as any[];
  check("Marking lists both submissions", roster.filter((row) => row.submitted).length === 2, JSON.stringify(roster.map((r) => r.teacher_name)));
  const stats = (await admin.get("/api/admin/dashboard-stats")).json || {};
  check("Admin Home counts the new Fellows and Trainers", stats.totalTeachers >= 4 && stats.totalTrainers >= 2);

  writeFileSync(ACCOUNTS_FILE, [
    `# Demo accounts (${BASE})`,
    "",
    `Created ${new Date().toISOString()}. Remove with \`npx tsx scripts/demo-academy.ts remove\`.`,
    "",
    `Password for every demo account: \`${password}\``,
    "",
    "| Desk | Sign in as | With |",
    "| --- | --- | --- |",
    `| Admin | Admin | ${ACCOUNTS.admin.email} |`,
    `| Trainer (instructional) | Trainer | ${ACCOUNTS.instructional.email} |`,
    `| Trainer (in-house) | Trainer | ${ACCOUNTS.inHouse.email} |`,
    ...ACCOUNTS.fellows.map((fellow) => `| Fellow (${fellow.kind === "pre_service" ? "pre-service" : "in-house"}) | Fellow | ${fellow.email} |`),
    "",
  ].join("\n"));
}

async function remove() {
  const admin = new Person("admin");
  check("Admin signs in", ok2xx(await admin.signIn(ADMIN_ID, ADMIN_PASSWORD, "admin")));
  for (const batch of ((await admin.get("/api/batches")).json || []) as any[]) {
    if (String(batch.name).startsWith(PREFIX)) check(`Remove cohort ${batch.name}`, ok2xx(await admin.del(`/api/batches/${batch.id}`)));
  }
  for (const course of ((await admin.get("/api/courses")).json || []) as any[]) {
    if (String(course.name).startsWith(PREFIX)) check(`Remove course ${course.name}`, ok2xx(await admin.del(`/api/courses/${course.id}`)));
  }
  for (const entry of ((await admin.get("/api/academy-calendar")).json || []) as any[]) {
    if (String(entry.title).startsWith(PREFIX)) check(`Remove ${entry.title}`, ok2xx(await admin.del(`/api/admin/academy-calendar/${entry.id}`)));
  }
  // People are made inactive, not deleted, so their emails stay taken; reseeding needs new emails.
  for (const trainer of ((await admin.get("/api/admin/trainers")).json || []) as any[]) {
    if (String(trainer.email || "").startsWith("demo.") && trainer.approvalStatus !== "inactive") {
      check(`Deactivate ${trainer.email}`, ok2xx(await admin.del(`/api/admin/dismiss-user/${trainer.id}`)));
    }
  }
  for (const fellow of ((await admin.get("/api/admin/teachers")).json || []) as any[]) {
    if (String(fellow.email || "").startsWith("demo.") && fellow.approvalStatus !== "inactive") {
      check(`Deactivate ${fellow.email}`, ok2xx(await admin.del(`/api/admin/dismiss-teacher/${fellow.id}`)));
    }
  }
}

(MODE === "seed" ? seed() : remove())
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} steps passed.`);
    if (MODE === "seed" && failed.length === 0) console.log(`Accounts written to ${ACCOUNTS_FILE}.`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((error) => {
    console.error("Demo stopped:", error);
    process.exit(1);
  });
