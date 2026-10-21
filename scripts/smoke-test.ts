const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8765";

type Check = { name: string; ok: boolean; detail: string };

async function request(
  path: string,
  options: RequestInit = {},
  cookies?: string,
): Promise<{ status: number; json: any; text: string; setCookie: string }> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (cookies) headers.set("Cookie", cookies);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const setCookie = res.headers.getSetCookie?.().join("; ") || res.headers.get("set-cookie") || "";
  return { status: res.status, json, text, setCookie };
}

function cookieHeader(setCookie: string, previous = ""): string {
  const pairs = [previous, setCookie]
    .join("; ")
    .split(/,(?=[^;]+?=)/)
    .flatMap((part) => part.split(";"))
    .map((part) => part.trim())
    .filter((part) => part.includes("=") && !/^(Path|HttpOnly|SameSite|Max-Age|Expires|Secure)/i.test(part));
  return [...new Set(pairs)].join("; ");
}

async function pagesLoad(
  record: (name: string, ok: boolean, detail: string) => void,
  name: string,
  cookies: string,
  paths: string[],
) {
  const failed: string[] = [];
  for (const path of paths) {
    const res = await request(path, {}, cookies);
    if (res.status !== 200) {
      failed.push(`${path}=${res.status}`);
    }
  }
  record(name, failed.length === 0, failed.length ? failed.join(" ") : `${paths.length} ok`);
}

async function main() {
  const checks: Check[] = [];
  const record = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  };

  try {
    const home = await request("/");
    record("App serves UI", home.status === 200 && home.text.includes("<div id=\"root\">"), `HTTP ${home.status}`);
  } catch (error) {
    record("App serves UI", false, error instanceof Error ? error.message : String(error));
    printSummary(checks);
    process.exit(1);
  }

  const unauth = await request("/api/user");
  record("Unauthenticated /api/user is blocked", unauth.status === 401, `HTTP ${unauth.status}`);

  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  const cookies = cookieHeader(login.setCookie);
  record(
    "Admin login",
    login.status === 200 && login.json?.role === "admin",
    `HTTP ${login.status} role=${login.json?.role || "none"}`,
  );

  const me = await request("/api/user", {}, cookies);
  record("Session cookie works", me.status === 200 && me.json?.username === "admin", `HTTP ${me.status}`);

  const courses = await request("/api/courses", {}, cookies);
  record("Courses API", courses.status === 200 && Array.isArray(courses.json), `HTTP ${courses.status} count=${Array.isArray(courses.json) ? courses.json.length : 0}`);

  const batches = await request("/api/admin/analytics/batches", {}, cookies);
  const batchList = Array.isArray(batches.json) ? batches.json : [];
  const bogusAtRisk = batchList.some((batch: any) =>
    (batch.teacherCount || 0) <= 5
    && (batch.completionPercentage ?? 0) === 0
    && batch.status === "at-risk"
  );
  record(
    "Cohort status is not teacher-count based",
    batches.status === 200 && Array.isArray(batches.json) && !bogusAtRisk,
    `HTTP ${batches.status} batches=${batchList.length} sample=${batchList[0]?.status || "n/a"}`,
  );

  const pending = await request("/api/admin/pending-trainers", {}, cookies);
  record("Pending trainers API", pending.status === 200 && Array.isArray(pending.json), `HTTP ${pending.status}`);

  const stats = await request("/api/admin/dashboard-stats", {}, cookies);
  record(
    "Dashboard stats API",
    stats.status === 200 && typeof stats.json?.totalCourses === "number" && typeof stats.json?.pendingTeachers === "number",
    `HTTP ${stats.status}`,
  );

  const health = await request("/api/health");
  record(
    "Health reports Neon backup copy",
    (health.status === 200 || health.status === 503) && typeof health.json?.blob === "boolean",
    `HTTP ${health.status} blob=${health.json?.blob}`,
  );

  const wholeAcademy = await request("/api/admin/fresh-start", {
    method: "POST",
    body: JSON.stringify({ confirm: "CLEAR ACTIVITY" }),
  }, cookies);
  record(
    "Clear activity refuses the whole academy",
    wholeAcademy.status === 400,
    `HTTP ${wholeAcademy.status} ${wholeAcademy.json?.error || ""}`,
  );

  const batchRows = await request("/api/batches", {}, cookies);
  const firstBatch = Array.isArray(batchRows.json) ? batchRows.json[0] : null;
  if (firstBatch?.id) {
    const history = await request(`/api/batches/${firstBatch.id}/approval-history?page=1`, {}, cookies);
    record(
      "Batch approval history is paged",
      history.status === 200 && Array.isArray(history.json?.items) && typeof history.json?.total === "number",
      `HTTP ${history.status} total=${history.json?.total}`,
    );
    const historyCsv = await request(`/api/batches/${firstBatch.id}/approval-history?format=csv`, {}, cookies);
    record(
      "Batch approval history exports",
      historyCsv.status === 200 && historyCsv.text.startsWith("created_at,"),
      `HTTP ${historyCsv.status}`,
    );
  } else {
    record("Batch approval history is paged", batchRows.status === 200, "no batches yet");
  }

  const notice = await request("/api/admin/announce", {
    method: "POST",
    body: JSON.stringify({ title: "Smoke notice", message: "Desk check" }),
  }, cookies);
  record("Admin can send an academy notice", notice.status === 200 && typeof notice.json?.sent === "number", `HTTP ${notice.status}`);

  const upload = await request("/api/objects/upload", { method: "POST" }, cookies);
  record(
    "Local upload URL is issued",
    upload.status === 200 && typeof upload.json?.uploadURL === "string",
    `HTTP ${upload.status} ${upload.json?.error || upload.json?.uploadURL || "ok"}`,
  );

  const trainerWithAdminPassword = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin123", role: "trainer" }),
  });
  record(
    "Trainer desk rejects admin password",
    trainerWithAdminPassword.status === 401,
    `HTTP ${trainerWithAdminPassword.status}`,
  );

  const teacherWithAdminPassword = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "admin123", role: "teacher" }),
  });
  record(
    "Teacher desk rejects admin password",
    teacherWithAdminPassword.status === 401,
    `HTTP ${teacherWithAdminPassword.status}`,
  );

  const trainerLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "trainer1", password: "trainer123", role: "trainer" }),
  });
  const trainerCookies = cookieHeader(trainerLogin.setCookie);
  record(
    "Trainer login",
    trainerLogin.status === 200 && trainerLogin.json?.role === "trainer",
    `HTTP ${trainerLogin.status} role=${trainerLogin.json?.role || "none"}`,
  );

  const teacherLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "teacher@test.com", password: "teacher123" }),
  });
  const teacherCookies = cookieHeader(teacherLogin.setCookie);
  record(
    "Teacher login",
    teacherLogin.status === 200 && teacherLogin.json?.role === "teacher",
    `HTTP ${teacherLogin.status} role=${teacherLogin.json?.role || "none"}`,
  );

  const deskNote = await request(
    "/api/desk-messages",
    {
      method: "POST",
      body: JSON.stringify({
        toId: teacherLogin.json?.id,
        toRole: "teacher",
        body: "Smoke desk mail",
      }),
    },
    trainerCookies,
  );
  record(
    "Trainer can send desk mail",
    deskNote.status === 201 && typeof deskNote.json?.id === "string",
    `HTTP ${deskNote.status}`,
  );

  const teacherProfile = await request("/api/teacher/profile/details", {}, teacherCookies);
  record(
    "Teacher profile details",
    teacherProfile.status === 200 && typeof teacherProfile.json?.email === "string",
    `HTTP ${teacherProfile.status}`,
  );

  const assignedWeeks = await request("/api/teacher/assigned-weeks", {}, teacherCookies);
  record(
    "Teacher assigned modules",
    assignedWeeks.status === 200 && Array.isArray(assignedWeeks.json),
    `HTTP ${assignedWeeks.status} count=${Array.isArray(assignedWeeks.json) ? assignedWeeks.json.length : 0}`,
  );

  const teacherMe = await request("/api/teacher/me", {}, teacherCookies);
  record("Teacher session is not an admin session", teacherMe.status === 200 && teacherMe.json?.role !== "admin", `HTTP ${teacherMe.status}`);

  const deskPeers = await request("/api/teacher/desk-peers", {}, teacherCookies);
  record(
    "Teacher desk peers",
    deskPeers.status === 200 && Array.isArray(deskPeers.json),
    `HTTP ${deskPeers.status}`,
  );

  await pagesLoad(record, "Admin desk pages load", cookies, [
    "/api/admin/dashboard-stats",
    "/api/admin/trainers",
    "/api/admin/teachers",
    "/api/admin/academy-path",
    "/api/admin/attendance",
    "/api/admin/certificates",
    "/api/admin/certificate-templates",
    "/api/admin/analytics/batches",
    "/api/admin/analytics/courses",
    "/api/admin/analytics/snapshot",
    "/api/admin/analytics/pipeline",
    "/api/admin/analytics/demographics",
    "/api/admin/analytics/cohorts",
    "/api/admin/analytics/performance",
    "/api/admin/pending-trainers",
    "/api/admin/pending-teachers",
  ]);
  await pagesLoad(record, "Trainer desk pages load", trainerCookies, [
    "/api/trainer/desk",
    "/api/trainer/pending-reviews",
    "/api/training-weeks",
    "/api/batches",
    "/api/notifications",
    "/api/trainer/analytics",
  ]);
  await pagesLoad(record, "Teacher desk pages load", teacherCookies, [
    "/api/teacher/me",
    "/api/teacher/academy-path",
    "/api/teacher/report-card",
    "/api/teacher/assigned-weeks",
    "/api/teacher/medals",
    "/api/teacher/desk-peers",
    "/api/notifications",
    "/api/teacher/reflections",
    "/api/teacher/trainer-comments",
    "/api/teacher/goals",
    "/api/teacher/improvement-tips",
    "/api/teacher/progress-summary",
    "/api/teacher/events",
    "/api/teacher/skills-map",
    "/api/teacher/quizzes",
    "/api/teacher/assignments",
  ]);

  const trainerBatches = await request("/api/batches", {}, trainerCookies);
  record(
    "Trainer can list cohorts",
    trainerBatches.status === 200 && Array.isArray(trainerBatches.json),
    `HTTP ${trainerBatches.status}`,
  );
  const trainerCreateTeacher = await request("/api/admin/users/create", {
    method: "POST",
    body: JSON.stringify({ name: "Nope", email: "nope@test.com", password: "secret12", role: "teacher" }),
  }, trainerCookies);
  record("Trainer cannot use admin create-user", trainerCreateTeacher.status === 403 || trainerCreateTeacher.status === 401, `HTTP ${trainerCreateTeacher.status}`);

  const adminTeachers = await request("/api/admin/teachers", {}, cookies);
  record("Admin teacher list", adminTeachers.status === 200 && Array.isArray(adminTeachers.json), `HTTP ${adminTeachers.status}`);

  const trainerIssue = await request("/api/admin/certificates/issue", {
    method: "POST",
    body: JSON.stringify({ teacherId: "x", design: "fellowship", occasion: "graduation" }),
  }, trainerCookies);
  record(
    "Trainer cannot issue academy certificate",
    trainerIssue.status === 403 || trainerIssue.status === 401,
    `HTTP ${trainerIssue.status}`,
  );

  const certTemplates = await request("/api/admin/certificate-templates", {}, cookies);
  record(
    "Admin certificate templates",
    certTemplates.status === 200 && Boolean(certTemplates.json?.designs?.fellowship) && Boolean(certTemplates.json?.designs?.advanced),
    `HTTP ${certTemplates.status}`,
  );

  const fellowshipImg = await request("/cert-fellowship.jpg");
  const advancedImg = await request("/cert-advanced.jpg");
  record(
    "Official certificate images",
    fellowshipImg.status === 200 && advancedImg.status === 200,
    `fellowship=${fellowshipImg.status} advanced=${advancedImg.status}`,
  );

  const fellow = Array.isArray(adminTeachers.json)
    ? adminTeachers.json.find((row: any) => row.approvalStatus !== "inactive") || adminTeachers.json[0]
    : null;
  const issuedCert = fellow?.id
    ? await request("/api/admin/certificates/issue", {
      method: "POST",
      body: JSON.stringify({ teacherId: fellow.id, design: "fellowship", occasion: "graduation" }),
    }, cookies)
    : { status: 0, json: null as any };
  record(
    "Admin can issue graduation certificate",
    issuedCert.status === 201 && typeof issuedCert.json?.id === "string" && Boolean(issuedCert.json?.teacherName),
    `HTTP ${issuedCert.status}`,
  );
  const youtubeReject = await request("/api/training-weeks/not-a-week/external-link", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com" }),
  }, cookies);
  record("YouTube link rejects non-YouTube URLs", youtubeReject.status >= 400, `HTTP ${youtubeReject.status}`);

  const stamp = Date.now();
  const createdTeacher = await request("/api/admin/users/create", {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Teacher",
      email: `smoke.teacher.${stamp}@test.com`,
      password: "smoke123",
      role: "teacher",
    }),
  }, cookies);
  record("Admin can create a teacher", createdTeacher.status === 201 && createdTeacher.json?.role === "teacher", `HTTP ${createdTeacher.status}`);
  const teacherId = createdTeacher.json?.id;
  if (teacherId) {
    const patched = await request(`/api/admin/teachers/${teacherId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Smoke Teacher Updated", email: createdTeacher.json.email }),
    }, cookies);
    record("Admin can update a teacher", patched.status === 200, `HTTP ${patched.status} name=${patched.json?.name || "n/a"}`);
    const removed = await request(`/api/admin/dismiss-teacher/${teacherId}`, { method: "DELETE" }, cookies);
    record("Admin can delete a teacher", removed.status === 200, `HTTP ${removed.status}`);
  } else {
    record("Admin can update a teacher", false, "create did not return id");
    record("Admin can delete a teacher", false, "create did not return id");
  }

  const createdTrainer = await request("/api/admin/users/create", {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Trainer",
      email: `smoke.trainer.${stamp}@test.com`,
      password: "smoke123",
      role: "trainer",
    }),
  }, cookies);
  record("Admin can create a trainer", createdTrainer.status === 201 && createdTrainer.json?.role === "trainer", `HTTP ${createdTrainer.status}`);
  const trainerId = createdTrainer.json?.id;
  if (trainerId) {
    const patchedTrainer = await request(`/api/admin/trainers/${trainerId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Smoke Trainer Updated", email: createdTrainer.json.email }),
    }, cookies);
    record("Admin can update a trainer", patchedTrainer.status === 200, `HTTP ${patchedTrainer.status}`);
    const removedTrainer = await request(`/api/admin/dismiss-user/${trainerId}`, { method: "DELETE" }, cookies);
    record("Admin can delete a trainer", removedTrainer.status === 200, `HTTP ${removedTrainer.status}`);
  } else {
    record("Admin can update a trainer", false, "create did not return id");
    record("Admin can delete a trainer", false, "create did not return id");
  }

  const pipeline = await request("/api/admin/analytics/pipeline", {}, cookies);
  record(
    "Pipeline analytics",
    pipeline.status === 200 && typeof pipeline.json?.totalCandidates === "number",
    `HTTP ${pipeline.status} candidates=${pipeline.json?.totalCandidates ?? "n/a"}`,
  );

  const cohorts = await request("/api/admin/analytics/cohorts", {}, cookies);
  record(
    "Cohort analytics",
    cohorts.status === 200 && Array.isArray(cohorts.json),
    `HTTP ${cohorts.status} cohorts=${Array.isArray(cohorts.json) ? cohorts.json.length : 0}`,
  );

  for (const account of [
    { name: "Admin", username: "admin", password: "admin123", role: "admin" },
    { name: "Trainer", username: "trainer1", password: "trainer123", role: "trainer" },
    { name: "Teacher", username: "teacher@test.com", password: "teacher123", role: "teacher" },
  ]) {
    const first = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: account.username, password: account.password }),
    });
    const firstCookies = cookieHeader(first.setCookie);
    const logout = await request("/api/logout", { method: "POST" }, firstCookies);
    const second = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: account.username, password: account.password }),
    });
    record(
      `${account.name} login works twice after logout`,
      first.status === 200 && first.json?.role === account.role
        && logout.status === 200
        && second.status === 200 && second.json?.role === account.role,
      `first=${first.status} logout=${logout.status} second=${second.status} role=${second.json?.role || "none"}`,
    );
  }

  const roleBlocked = async (name: string, path: string, jar: string, method = "GET", body?: unknown) => {
    const res = await request(path, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    }, jar);
    record(name, res.status === 401 || res.status === 403, `HTTP ${res.status}`);
  };
  await roleBlocked("Teacher cannot open cohorts", "/api/batches", teacherCookies);
  await roleBlocked("Teacher cannot open the staff lesson list", "/api/training-weeks", teacherCookies);
  await roleBlocked("Teacher cannot open admin stats", "/api/admin/dashboard-stats", teacherCookies);
  await roleBlocked("Teacher cannot clear the academy", "/api/admin/fresh-start", teacherCookies, "POST", { confirm: "CLEAR ACTIVITY" });
  await roleBlocked("Trainer cannot open admin stats", "/api/admin/dashboard-stats", trainerCookies);
  await roleBlocked("Trainer cannot clear the academy", "/api/admin/fresh-start", trainerCookies, "POST", { confirm: "CLEAR ACTIVITY" });
  await roleBlocked("Trainer cannot assign a trainer to a class", "/api/batches/not-a-batch/trainer", trainerCookies, "PUT", { trainerId: "someone" });
  await roleBlocked("Trainer cannot add a course", "/api/courses", trainerCookies, "POST", { name: `Trainer course ${stamp}`, description: "blocked" });

  const openCourses = await request("/api/courses");
  record("Course catalog requires a login", openCourses.status === 401, `HTTP ${openCourses.status}`);
  record(
    "Login responses hide passwords",
    !("password" in (login.json || {})) && !("password" in (trainerLogin.json || {})) && !("password" in (teacherLogin.json || {})),
    "password field absent",
  );

  const hidden = await request("/api/batches", {
    method: "POST",
    body: JSON.stringify({ name: `Hidden cohort ${stamp}`, description: "not assigned to trainer1" }),
  }, cookies);
  record("Admin can create a cohort", hidden.status === 201 && typeof hidden.json?.id === "string", `HTTP ${hidden.status}`);
  if (hidden.json?.id) {
    const trainerView = await request("/api/batches", {}, trainerCookies);
    const ids = Array.isArray(trainerView.json) ? trainerView.json.map((batch: any) => batch.id) : [];
    record(
      "Trainer does not see an unassigned cohort",
      trainerView.status === 200 && !ids.includes(hidden.json.id),
      `visible=${ids.length}`,
    );
    const peek = await request(`/api/batches/${hidden.json.id}`, {}, trainerCookies);
    record("Trainer cannot open an unassigned cohort", peek.status === 403 || peek.status === 404, `HTTP ${peek.status}`);
    const removedHidden = await request(`/api/batches/${hidden.json.id}`, { method: "DELETE" }, cookies);
    record("Admin can remove the test cohort", removedHidden.status === 204 || removedHidden.status === 200, `HTTP ${removedHidden.status}`);
  } else {
    record("Trainer does not see an unassigned cohort", false, "cohort was not created");
    record("Trainer cannot open an unassigned cohort", false, "cohort was not created");
    record("Admin can remove the test cohort", false, "cohort was not created");
  }

  const place = await request("/places/place-library.jpg");
  record("School scene image is served", place.status === 200 && place.text.length > 1000, `HTTP ${place.status}`);

  const gapCourse = await request("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Smoke course ${stamp}`, description: "gap check" }),
  }, cookies);
  const gapCourseId = gapCourse.json?.id;
  const gapWeek = gapCourseId
    ? await request("/api/training-weeks", {
      method: "POST",
      body: JSON.stringify({
        courseId: gapCourseId,
        weekNumber: 1,
        competencyFocus: "Classroom practice",
        objective: "Apply one idea",
      }),
    }, cookies)
    : { status: 0, json: null as any };
  const gapWeekId = gapWeek.json?.id;
  record(
    "Admin can add a module without a file",
    gapCourse.status === 200 && gapWeek.status === 200 && typeof gapWeekId === "string",
    `course=${gapCourse.status} week=${gapWeek.status}`,
  );

  const gapCohort = await request("/api/batches", {
    method: "POST",
    body: JSON.stringify({ name: `Smoke cohort ${stamp}`, description: "gap check" }),
  }, cookies);
  const gapCohortId = gapCohort.json?.id;
  const assignedTrainer = gapCohortId && trainerLogin.json?.id
    ? await request(`/api/batches/${gapCohortId}/trainer`, {
      method: "PUT",
      body: JSON.stringify({ trainerId: trainerLogin.json.id }),
    }, cookies)
    : { status: 0, json: null as any };
  record(
    "Admin can assign trainer1 to a cohort",
    assignedTrainer.status === 200 && assignedTrainer.json?.trainerId === trainerLogin.json?.id,
    `HTTP ${assignedTrainer.status}`,
  );
  if (gapCohortId) {
    await pagesLoad(record, "Trainer cohort room pages load", trainerCookies, [
      `/api/batches/${gapCohortId}`,
      `/api/batches/${gapCohortId}/courses`,
      `/api/batches/${gapCohortId}/quizzes`,
      `/api/batches/${gapCohortId}/file-quizzes`,
      `/api/batches/${gapCohortId}/progress`,
      `/api/batches/${gapCohortId}/certificates`,
      `/api/batches/${gapCohortId}/events`,
      `/api/batches/${gapCohortId}/assignments`,
      `/api/batches/${gapCohortId}/announcements`,
      `/api/batches/${gapCohortId}/attendance/summary`,
      `/api/batches/${gapCohortId}/certificate-template`,
    ]);
  }

  const openBatchCourses = gapCohortId ? await request(`/api/batches/${gapCohortId}/courses`) : { status: 0 };
  record("Cohort courses require a login", openBatchCourses.status === 401, `HTTP ${openBatchCourses.status}`);
  const teacherPeek = gapCohortId
    ? await request(`/api/batches/${gapCohortId}/courses`, {}, teacherCookies)
    : { status: 0 };
  record("Teacher cannot open another cohort's courses", teacherPeek.status === 403, `HTTP ${teacherPeek.status}`);

  const strangerCourses = await request("/api/teacher/00000000-0000-0000-0000-000000000000/courses");
  record("Another teacher's courses require a login", strangerCourses.status === 401, `HTTP ${strangerCourses.status}`);
  const ownCourses = teacherLogin.json?.id
    ? await request(`/api/teacher/${teacherLogin.json.id}/courses`, {}, teacherCookies)
    : { status: 0, json: null as any };
  record("Teacher can open their own courses", ownCourses.status === 200 && Array.isArray(ownCourses.json), `HTTP ${ownCourses.status}`);
  const otherCerts = teacherLogin.json?.id
    ? await request("/api/teacher/00000000-0000-0000-0000-000000000000/certificates", {}, teacherCookies)
    : { status: 0 };
  record("Teacher cannot open another teacher's certificates", otherCerts.status === 403, `HTTP ${otherCerts.status}`);
  const ownCerts = teacherLogin.json?.id
    ? await request(`/api/teacher/${teacherLogin.json.id}/certificates`, {}, teacherCookies)
    : { status: 0, json: null as any };
  record("Teacher can open their own certificates", ownCerts.status === 200 && Array.isArray(ownCerts.json), `HTTP ${ownCerts.status}`);

  const openRating = await request("/api/satisfaction-scores", {
    method: "POST",
    body: JSON.stringify({ type: "course", targetId: "x", targetType: "course", score: 5 }),
  });
  record("Ratings require a login", openRating.status === 401, `HTTP ${openRating.status}`);

  const badQuiz = gapCohortId && gapWeekId
    ? await request(`/api/batches/${gapCohortId}/assign-quiz`, {
      method: "POST",
      body: JSON.stringify({ weekId: gapWeekId, title: "Bad", questions: [{ question: "nope" }] }),
    }, trainerCookies)
    : { status: 0 };
  record("A broken manual question is rejected", badQuiz.status === 400, `HTTP ${badQuiz.status}`);

  const manualQuiz = gapCohortId && gapWeekId
    ? await request(`/api/batches/${gapCohortId}/assign-quiz`, {
      method: "POST",
      body: JSON.stringify({
        weekId: gapWeekId,
        title: "Written quiz",
        questions: [{
          id: "q1",
          type: "true_false",
          question: "Practice comes before the quiz.",
          options: ["True", "False"],
          correctAnswer: "True",
        }],
      }),
    }, trainerCookies)
    : { status: 0, json: null as any };
  record(
    "Trainer can assign a quiz with no AI",
    manualQuiz.status === 201 && manualQuiz.json?.questions?.[0]?.question === "Practice comes before the quiz.",
    `HTTP ${manualQuiz.status}`,
  );

  const csv = gapCohortId
    ? await request(`/api/batches/${gapCohortId}/gradebook.csv`, {}, trainerCookies)
    : { status: 0, text: "" };
  record(
    "Trainer can export the gradebook",
    csv.status === 200 && csv.text.includes("quiz_average") && csv.text.includes("attendance_percent"),
    `HTTP ${csv.status}`,
  );

  const enrolled = gapCohortId
    ? await request(`/api/batches/${gapCohortId}/teachers`, {
      method: "POST",
      body: JSON.stringify({ teacherEmail: "teacher@test.com" }),
    }, trainerCookies)
    : { status: 0 };
  record("Trainer can add the test teacher", enrolled.status === 201, `HTTP ${enrolled.status}`);

  const assignment = gapCohortId
    ? await request(`/api/batches/${gapCohortId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ title: "Smoke work", instructions: "Write one sentence." }),
    }, trainerCookies)
    : { status: 0, json: null as any };
  const assignmentId = assignment.json?.id;
  const dueStamp = "2026-12-01T09:00:00.000Z";
  const assignmentDue = assignmentId
    ? await request(`/api/batches/${gapCohortId}/assignments/${assignmentId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: dueStamp }),
    }, trainerCookies)
    : { status: 0, json: null as any };
  const quizDue = manualQuiz.json?.id
    ? await request(`/api/assigned-quizzes/${manualQuiz.json.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: dueStamp }),
    }, trainerCookies)
    : { status: 0, json: null as any };
  record(
    "Trainer can edit a deadline after work is created",
    assignmentDue.status === 200 && String(assignmentDue.json?.dueDate || "").startsWith("2026-12-01")
      && quizDue.status === 200 && String(quizDue.json?.dueDate || "").startsWith("2026-12-01"),
    `assignment=${assignmentDue.status} quiz=${quizDue.status}`,
  );
  const submitted = assignmentId
    ? await request(`/api/teacher/assignments/${assignmentId}/submit`, {
      method: "POST",
      body: JSON.stringify({ response: "I will greet the class." }),
    }, teacherCookies)
    : { status: 0 };
  const marked = assignmentId && teacherLogin.json?.id
    ? await request(`/api/batches/${gapCohortId}/assignments/${assignmentId}/submissions/${teacherLogin.json.id}`, {
      method: "PATCH",
      body: JSON.stringify({ trainerScore: 90, trainerComment: "Clear opening.", rubric: { opening: 5 } }),
    }, trainerCookies)
    : { status: 0, json: null as any };
  const seen = await request("/api/teacher/assignments", {}, teacherCookies);
  const found = Array.isArray(seen.json)
    ? seen.json.find((row: any) => row.id === assignmentId)
    : null;
  record(
    "Trainer mark and comment reach the teacher",
    submitted.status === 200 && marked.status === 200 && (found?.trainer_comment === "Clear opening." || found?.trainerComment === "Clear opening."),
    `submit=${submitted.status} mark=${marked.status} comment=${found?.trainer_comment || found?.trainerComment || "missing"}`,
  );

  const posted = gapWeekId
    ? await request(`/api/weeks/${gapWeekId}/discussions`, {
      method: "POST",
      body: JSON.stringify({ body: "Smoke thread" }),
    }, teacherCookies)
    : { status: 0 };
  const thread = gapWeekId
    ? await request(`/api/weeks/${gapWeekId}/discussions`, {}, trainerCookies)
    : { status: 0, json: null as any };
  const threadHit = Array.isArray(thread.json) && thread.json.some((row: any) => row.body === "Smoke thread");
  const trainerReply = gapWeekId
    ? await request(`/api/weeks/${gapWeekId}/discussions`, {
      method: "POST",
      body: JSON.stringify({ body: "Trainer reply" }),
    }, trainerCookies)
    : { status: 0 };
  record(
    "Teacher and trainer share a module thread",
    posted.status === 201 && trainerReply.status === 201 && threadHit,
    `teacher=${posted.status} trainer=${trainerReply.status}`,
  );

  if (manualQuiz.json?.id) {
    await request(`/api/assigned-quizzes/${manualQuiz.json.id}`, { method: "DELETE" }, trainerCookies);
  }
  if (gapCohortId) await request(`/api/batches/${gapCohortId}`, { method: "DELETE" }, cookies);
  if (gapCourseId) await request(`/api/courses/${gapCourseId}`, { method: "DELETE" }, cookies);

  const reset = await request("/api/emergency-admin-reset", {
    method: "POST",
    body: JSON.stringify({ masterKey: "x", username: "admin", newPassword: "admin123" }),
  });
  record("Emergency reset is closed", reset.status === 403, `HTTP ${reset.status}`);

  printSummary(checks);
  if (checks.some((check) => !check.ok)) process.exit(1);
}

function printSummary(checks: Check[]) {
  const passed = checks.filter((check) => check.ok).length;
  console.log(`\nSmoke ${passed}/${checks.length} passed against ${BASE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
