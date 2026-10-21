/**
 * Create the practice batches on a running academy and enrol the test desks.
 * Uses the documented test admin. Does not print passwords or change an existing hash.
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:8765 npx tsx scripts/distribute-test-batches.ts
 */
import { TEST_COHORTS, TEST_TEACHERS } from "./test-cohorts";
import { LEARNING_STAGES, LESSON_STAGES, RETIRED_BATCH_NAMES } from "../shared/tanzaniaPath";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8765";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const TRAINER_PASSWORD = "trainer123";
const TEACHER_PASSWORD = "teacher123";

const TRAINERS = [
  { username: "trainer1", email: "trainer@test.com", name: "Test Trainer" },
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
  const listed = Array.isArray(batchList.json) ? batchList.json : [];
  for (const row of listed) {
    if (!RETIRED_BATCH_NAMES.includes(row.name)) continue;
    const removed = await request(`/api/batches/${row.id}`, { method: "DELETE" }, cookies);
    if (removed.status === 204 || removed.status === 200) console.log(`retired ${row.name}`);
    else console.error(`could not retire ${row.name} HTTP ${removed.status}`);
  }

  const courseList = await request("/api/courses", {}, cookies);
  const existingCourses = Array.isArray(courseList.json) ? courseList.json : [];
  const courseIdByStage = new Map<string, string>();
  for (const [index, stage] of LEARNING_STAGES.entries()) {
    let course = existingCourses.find((row: any) => row.name === stage.course);
    if (!course) {
      const created = await request("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          name: stage.course,
          description: stage.summary,
          objectives: `Government lesson: ${LESSON_STAGES.join(", ")}.`,
          stage: stage.id,
          track: stage.track,
          publishStatus: "published",
          orderIndex: index,
        }),
      }, cookies);
      course = created.json;
      if (!course?.id) {
        console.error(`could not create course ${stage.course} HTTP ${created.status}`);
        process.exit(1);
      }
      console.log(`created course ${stage.course}`);
    }
    const weeksRes = await request(`/api/courses/${course.id}/weeks`, {}, cookies);
    const weeks = Array.isArray(weeksRes.json) ? weeksRes.json : [];
    for (let moduleIndex = 0; moduleIndex < stage.modules.length; moduleIndex += 1) {
      const weekNumber = moduleIndex + 1;
      const module = stage.modules[moduleIndex];
      if (weeks.some((week: any) => week.weekNumber === weekNumber || week.competencyFocus === module.focus)) continue;
      const createdWeek = await request("/api/training-weeks", {
        method: "POST",
        body: JSON.stringify({
          courseId: course.id,
          weekNumber,
          competencyFocus: module.focus,
          objective: module.objective,
        }),
      }, cookies);
      if (!createdWeek.json?.id) {
        console.error(`could not add module ${module.focus} HTTP ${createdWeek.status}`);
        process.exit(1);
      }
      console.log(`added ${module.focus} to ${stage.course}`);
    }
    courseIdByStage.set(stage.id, course.id);
  }

  const freshList = await request("/api/batches", {}, cookies);
  const batches = Array.isArray(freshList.json) ? freshList.json : [];
  for (const cohort of TEST_COHORTS) {
    const trainerId = trainerIdByUsername.get(cohort.trainerUsername);
    if (!trainerId) throw new Error(`Missing ${cohort.trainerUsername}`);
    let batch = batches.find((row: any) => row.id === cohort.id || row.name === cohort.name);
    if (!batch) {
      const created = await request("/api/batches", {
        method: "POST",
        body: JSON.stringify({
          name: cohort.name,
          description: cohort.description,
          stage: cohort.stage,
          track: cohort.track,
        }),
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
    const patched = await request(`/api/batches/${batch.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: cohort.name,
        description: cohort.description,
        stage: cohort.stage,
        track: cohort.track,
      }),
    }, cookies);
    if (patched.status !== 200 && patched.status !== 404) {
      console.error(`could not label ${cohort.name} HTTP ${patched.status}`);
    }
    const courseId = courseIdByStage.get(cohort.stage);
    if (courseId) {
      const linked = await request(`/api/batches/${batch.id}/courses`, {}, cookies);
      const linkedCourses = Array.isArray(linked.json) ? linked.json : [];
      if (!linkedCourses.some((row: any) => row.id === courseId)) {
        const addedCourse = await request(`/api/batches/${batch.id}/courses`, {
          method: "POST",
          body: JSON.stringify({ courseId }),
        }, cookies);
        if (addedCourse.status === 200 || addedCourse.status === 201) console.log(`course on ${cohort.name}`);
        else if (addedCourse.status === 409) console.log(`course already on ${cohort.name}`);
        else console.error(`could not put course on ${cohort.name} HTTP ${addedCourse.status}`);
      }
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
