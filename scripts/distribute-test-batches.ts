/**
 * Create the practice batches on a running academy and enrol the test desks.
 * Uses the documented test admin. Does not print passwords or change an existing hash.
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:8765 npx tsx scripts/distribute-test-batches.ts
 */
import { TEST_COHORTS, TEST_TEACHERS } from "./test-cohorts";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8765";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const TRAINER_PASSWORD = "trainer123";
const TEACHER_PASSWORD = "teacher123";

const TRAINERS = [
  { username: "trainer1", email: "trainer@test.com", name: "Test Trainer" },
  { username: "trainer2", email: "trainer2@test.com", name: "Test Trainer 2" },
  { username: "trainer3", email: "trainer3@test.com", name: "Test Trainer 3" },
  { username: "trainer4", email: "trainer4@test.com", name: "Test Trainer 4" },
  { username: "trainer5", email: "trainer5@test.com", name: "Test Trainer 5" },
  { username: "trainer6", email: "trainer6@test.com", name: "Test Trainer 6" },
  { username: "test.trainer", email: "test.trainer@silverleaf.academy", name: "Test Trainer" },
];

async function request(path: string, options: RequestInit = {}, cookies = "") {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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

function cookieHeader(setCookie: string) {
  return setCookie
    .split(/,(?=[^;]+?=)/)
    .flatMap((part) => part.split(";"))
    .map((part) => part.trim())
    .filter((part) => part.includes("=") && !/^(Path|HttpOnly|SameSite|Max-Age|Expires|Secure)/i.test(part))
    .join("; ");
}

async function main() {
  const login = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD, role: "admin" }),
  });
  if (login.status !== 200) {
    console.error(`admin login failed HTTP ${login.status}`);
    process.exit(1);
  }
  const cookies = cookieHeader(login.setCookie);

  const trainerList = await request("/api/trainers", {}, cookies);
  const trainers = Array.isArray(trainerList.json) ? trainerList.json : [];
  const trainerIdByUsername = new Map<string, string>();
  for (const wanted of TRAINERS) {
    const found = trainers.find((row: any) => row.username === wanted.username || row.email === wanted.email);
    if (found) {
      trainerIdByUsername.set(wanted.username, found.id);
      continue;
    }
    const created = await request("/api/admin/users/create", {
      method: "POST",
      body: JSON.stringify({
        email: wanted.email,
        password: TRAINER_PASSWORD,
        name: wanted.name,
        role: "trainer",
      }),
    }, cookies);
    if (created.status !== 201 || !created.json?.id) {
      console.error(`could not add ${wanted.username} HTTP ${created.status}`);
      process.exit(1);
    }
    trainerIdByUsername.set(wanted.username, created.json.id);
    console.log(`created trainer ${wanted.username}`);
  }

  const teacherList = await request("/api/admin/teachers", {}, cookies);
  const teachers = Array.isArray(teacherList.json) ? teacherList.json : [];
  const teacherIdByEmail = new Map<string, string>();
  for (const wanted of TEST_TEACHERS) {
    const found = teachers.find((row: any) => String(row.email || "").toLowerCase() === wanted.email.toLowerCase());
    if (found) {
      teacherIdByEmail.set(wanted.email.toLowerCase(), found.id);
      continue;
    }
    const created = await request("/api/admin/users/create", {
      method: "POST",
      body: JSON.stringify({
        email: wanted.email,
        password: TEACHER_PASSWORD,
        name: wanted.name,
        role: "teacher",
      }),
    }, cookies);
    if (created.status !== 201 || !created.json?.id) {
      console.error(`could not add ${wanted.email} HTTP ${created.status} ${created.json?.error || ""}`);
      process.exit(1);
    }
    teacherIdByEmail.set(wanted.email.toLowerCase(), created.json.id);
    console.log(`created teacher ${wanted.email}`);
  }

  const batchList = await request("/api/batches", {}, cookies);
  const batches = Array.isArray(batchList.json) ? batchList.json : [];
  for (const cohort of TEST_COHORTS) {
    const trainerId = trainerIdByUsername.get(cohort.trainerUsername);
    if (!trainerId) throw new Error(`Missing ${cohort.trainerUsername}`);
    let batch = batches.find((row: any) => row.id === cohort.id || row.name === cohort.name);
    if (!batch) {
      const created = await request("/api/batches", {
        method: "POST",
        body: JSON.stringify({ name: cohort.name, description: cohort.description }),
      }, cookies);
      if (created.status !== 201 || !created.json?.id) {
        console.error(`could not create ${cohort.name} HTTP ${created.status}`);
        process.exit(1);
      }
      batch = created.json;
      console.log(`created ${cohort.name}`);
    }
    const assigned = await request(`/api/batches/${batch.id}/trainer`, {
      method: "PUT",
      body: JSON.stringify({ trainerId }),
    }, cookies);
    if (assigned.status !== 200) {
      console.error(`could not assign ${cohort.trainerUsername} HTTP ${assigned.status}`);
      process.exit(1);
    }
    const detail = await request(`/api/batches/${batch.id}`, {}, cookies);
    const present = new Set(
      (Array.isArray(detail.json?.teachers) ? detail.json.teachers : []).map((row: any) => String(row.email || "").toLowerCase()),
    );
    for (const email of cohort.teacherEmails) {
      if (present.has(email.toLowerCase())) {
        console.log(`kept ${email} in ${cohort.name}`);
        continue;
      }
      const added = await request(`/api/batches/${batch.id}/teachers`, {
        method: "POST",
        body: JSON.stringify({ teacherEmail: email }),
      }, cookies);
      if (added.status === 201) console.log(`enrolled ${email} in ${cohort.name}`);
      else if (added.status === 200) console.log(`kept ${email} in ${cohort.name}`);
      else console.error(`could not enrol ${email} HTTP ${added.status}`);
    }
    console.log(`${cohort.name} -> ${cohort.trainerUsername}`);
  }
  console.log(`batches distributed on ${BASE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
