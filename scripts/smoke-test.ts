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

  const trainerCookies = cookieHeader(trainerLogin.setCookie);
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
    cohorts.status === 200 && Array.isArray(cohorts.json) && cohorts.json.length > 0,
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

  const reset = await request("/api/emergency-admin-reset", {
    method: "POST",
    body: JSON.stringify({ masterKey: "x", username: "admin", newPassword: "admin123" }),
  });
  record("Emergency reset is unconfigured locally", reset.status === 503, `HTTP ${reset.status}`);

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
