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
  record("Dashboard stats API", stats.status === 200 && typeof stats.json?.totalCourses === "number", `HTTP ${stats.status}`);

  const upload = await request("/api/objects/upload", { method: "POST" }, cookies);
  record(
    "Local upload URL is issued",
    upload.status === 200 && typeof upload.json?.uploadURL === "string",
    `HTTP ${upload.status} ${upload.json?.error || upload.json?.uploadURL || "ok"}`,
  );

  const trainerLogin = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "trainer1", password: "trainer123" }),
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

  const courseCompletion = await request("/api/analytics/course-completion", {}, cookies);
  record(
    "Course completion overview",
    courseCompletion.status === 200 && Array.isArray(courseCompletion.json),
    `HTTP ${courseCompletion.status} courses=${Array.isArray(courseCompletion.json) ? courseCompletion.json.length : 0}`,
  );

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
