import PizZip from "pizzip";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8765";

type Check = { id: string; name: string; ok: boolean; detail: string };

async function request(
  path: string,
  options: RequestInit = {},
  cookies?: string,
): Promise<{ status: number; json: any; text: string; setCookie: string }> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof Buffer) && typeof options.body === "string") {
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
  const setCookie = (res.headers as any).getSetCookie?.().join("; ") || res.headers.get("set-cookie") || "";
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

function pptxBuffer(slideTexts: string[]): Buffer {
  const zip = new PizZip();
  slideTexts.forEach((text, index) => {
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`,
    );
  });
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

async function jsonRequest(path: string, cookies: string, method = "GET", body?: unknown) {
  return request(
    path,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    cookies,
  );
}

async function main() {
  const checks: Check[] = [];
  const record = (id: string, name: string, ok: boolean, detail: string) => {
    checks.push({ id, name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}  ${detail}`);
  };

  const adminLogin = await jsonRequest("/api/login", "", "POST", { username: "admin", password: "admin123" });
  const adminCookie = cookieHeader(adminLogin.setCookie);
  if (adminLogin.status !== 200) {
    record("setup", "Admin login", false, `HTTP ${adminLogin.status}`);
    printSummary(checks);
    process.exit(1);
  }

  const oneDay = await jsonRequest("/api/courses", adminCookie, "POST", {
    name: `One-day Induction ${Date.now()}`,
    description: "Short course completed in one day",
  });
  const multiDay = await jsonRequest("/api/courses", adminCookie, "POST", {
    name: `Multi-day Pedagogy ${Date.now()}`,
    description: "Course with multiple modules",
  });
  const oneDayId = oneDay.json?.id;
  const multiDayId = multiDay.json?.id;
  record("setup", "Create one-day and multi-day courses", !!(oneDayId && multiDayId), `one=${oneDayId || "none"} multi=${multiDayId || "none"}`);

  const week1One = await jsonRequest("/api/training-weeks", adminCookie, "POST", {
    courseId: oneDayId,
    weekNumber: 1,
    competencyFocus: "Classroom management",
    objective: "Apply positive behaviour strategies in one day",
  });
  const week1Multi = await jsonRequest("/api/training-weeks", adminCookie, "POST", {
    courseId: multiDayId,
    weekNumber: 1,
    competencyFocus: "Lesson planning",
    objective: "Plan a lesson using the training model",
  });
  const week2Multi = await jsonRequest("/api/training-weeks", adminCookie, "POST", {
    courseId: multiDayId,
    weekNumber: 2,
    competencyFocus: "Assessment",
    objective: "Check for understanding after week 1",
  });
  const week3Multi = await jsonRequest("/api/training-weeks", adminCookie, "POST", {
    courseId: multiDayId,
    weekNumber: 3,
    competencyFocus: "Practice",
    objective: "Apply the model in a follow-up module",
  });
  const w1o = week1One.json?.id;
  const w1m = week1Multi.json?.id;
  const w2m = week2Multi.json?.id;
  const w3m = week3Multi.json?.id;
  record("setup", "Create week 1, 2, and 3 modules", !!(w1o && w1m && w2m && w3m), `w1o=${w1o} w1m=${w1m} w2m=${w2m} w3m=${w3m}`);

  async function attachPptx(weekId: string, fileName: string, slides: string[]) {
    const upload = await jsonRequest("/api/objects/upload", adminCookie, "POST", {});
    const uploadURL: string = upload.json?.uploadURL;
    if (!uploadURL || upload.status !== 200) {
      throw new Error(`upload URL failed HTTP ${upload.status} ${upload.text}`);
    }
    const buffer = pptxBuffer(slides);
    const putUrl = uploadURL.startsWith("http") ? uploadURL : `${BASE}${uploadURL}`;
    const put = await fetch(putUrl, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
      body: buffer,
    });
    if (!put.ok) throw new Error(`PUT ${putUrl} HTTP ${put.status}`);
    const attached = await jsonRequest(`/api/training-weeks/${weekId}/deck`, adminCookie, "POST", {
      files: [{ fileUrl: uploadURL, fileName, fileSize: buffer.length }],
    });
    const file = attached.json?.week?.deckFiles?.slice(-1)[0];
    if (!file?.id) throw new Error(`attach failed ${attached.text}`);
    return file;
  }

  let oneDayFile: any;
  let multiW1File: any;
  let multiW2File: any;
  let multiW3File: any;
  try {
    oneDayFile = await attachPptx(w1o, "induction.pptx", [
      "Classroom management and learner engagement in one-day induction",
      "Positive behaviour strategies help teachers keep lessons on track",
    ]);
    multiW1File = await attachPptx(w1m, "planning.pptx", [
      "Lesson planning uses objectives, activities, and checks for understanding",
      "Teachers write a clear success criterion before the lesson starts",
    ]);
    multiW2File = await attachPptx(w2m, "assessment.pptx", [
      "Assessment after week one confirms teachers can apply the model",
      "Exit tickets and questioning check for understanding",
    ]);
    multiW3File = await attachPptx(w3m, "practice.pptx", [
      "Week three practice applies classroom management and assessment together",
      "Teachers continue only after passing the previous module quiz",
    ]);
    record("2", "Upload PowerPoint slides into modules", true, "4 pptx files attached");
  } catch (error) {
    record("2", "Upload PowerPoint slides into modules", false, error instanceof Error ? error.message : String(error));
    printSummary(checks);
    process.exit(1);
  }

  const generated = await jsonRequest(
    `/api/training-weeks/${w1o}/files/${oneDayFile.id}/generate-quiz`,
    adminCookie,
    "POST",
    { numQuestions: 3, force: true },
  );
  const generatedQuestions = generated.json?.questions || [];
  const autoOk = generated.status === 200 && generatedQuestions.length > 0 && !/NO CONTENT/i.test(generated.text);
  record(
    "2",
    "Automatic quiz generation from uploaded slides",
    autoOk,
    `HTTP ${generated.status} questions=${generatedQuestions.length} ${generated.json?.error || ""}`.trim(),
  );

  const manualQuestions = [
    {
      id: "mq1",
      type: "true_false",
      question: "Teachers should use positive behaviour strategies.",
      options: ["True", "False"],
      correctAnswer: "True",
    },
    {
      id: "mq2",
      type: "true_false",
      question: "Lesson planning can skip success criteria.",
      options: ["True", "False"],
      correctAnswer: "False",
    },
  ];
  const savedManual = await jsonRequest(
    `/api/training-weeks/${w1m}/files/${multiW1File.id}/quiz`,
    adminCookie,
    "PATCH",
    { questions: manualQuestions },
  );
  const approvedManual = await jsonRequest(
    `/api/training-weeks/${w1m}/files/${multiW1File.id}/quiz/approve`,
    adminCookie,
    "POST",
    {},
  );
  record(
    "2",
    "Admin can create quiz questions manually",
    savedManual.status === 200 && approvedManual.status === 200,
    `save=${savedManual.status} approve=${approvedManual.status}`,
  );

  const week2Quiz = [
    {
      id: "w2q1",
      type: "true_false",
      question: "Assessment checks for understanding after week 1.",
      options: ["True", "False"],
      correctAnswer: "True",
    },
  ];
  await jsonRequest(`/api/training-weeks/${w2m}/files/${multiW2File.id}/quiz`, adminCookie, "PATCH", { questions: week2Quiz });
  await jsonRequest(`/api/training-weeks/${w2m}/files/${multiW2File.id}/quiz/approve`, adminCookie, "POST", {});
  await jsonRequest(`/api/training-weeks/${w3m}/files/${multiW3File.id}/quiz`, adminCookie, "PATCH", { questions: week2Quiz });
  await jsonRequest(`/api/training-weeks/${w3m}/files/${multiW3File.id}/quiz/approve`, adminCookie, "POST", {});
  if (generatedQuestions.length) {
    await jsonRequest(`/api/training-weeks/${w1o}/files/${oneDayFile.id}/quiz/approve`, adminCookie, "POST", {});
  } else {
    await jsonRequest(`/api/training-weeks/${w1o}/files/${oneDayFile.id}/quiz`, adminCookie, "PATCH", { questions: manualQuestions });
    await jsonRequest(`/api/training-weeks/${w1o}/files/${oneDayFile.id}/quiz/approve`, adminCookie, "POST", {});
  }

  const batch = await jsonRequest("/api/batches", adminCookie, "POST", {
    name: `PDF Check Cohort ${Date.now()}`,
    description: "Acceptance cohort for Taleemabad feedback",
  });
  const batchId = batch.json?.id;
  await jsonRequest(`/api/batches/${batchId}/courses`, adminCookie, "POST", { courseId: oneDayId });
  await jsonRequest(`/api/batches/${batchId}/courses`, adminCookie, "POST", { courseId: multiDayId });
  const teacherEmail = `pdf.teacher.${Date.now()}@test.com`;
  const teacherPassword = "teacher123";
  const createdTeacher = await jsonRequest("/api/admin/users/create", adminCookie, "POST", {
    email: teacherEmail,
    password: teacherPassword,
    name: "PDF Check Teacher",
    role: "teacher",
  });
  const enrolled = await jsonRequest(`/api/batches/${batchId}/teachers`, adminCookie, "POST", { teacherEmail });
  record("setup", "Enroll teacher in batch with both courses", (createdTeacher.status === 200 || createdTeacher.status === 201) && (enrolled.status === 201 || enrolled.status === 200), `create=${createdTeacher.status} enroll=${enrolled.status} ${enrolled.json?.error || ""}`);

  const teacherLogin = await jsonRequest("/api/teacher/login", "", "POST", {
    identifier: teacherEmail,
    password: teacherPassword,
  });
  const teacherCookie = cookieHeader(teacherLogin.setCookie);
  record("setup", "Teacher login", teacherLogin.status === 200, `HTTP ${teacherLogin.status}`);

  const assignedBefore = await jsonRequest("/api/teacher/assigned-weeks", teacherCookie);
  const weeksBefore = Array.isArray(assignedBefore.json) ? assignedBefore.json : [];
  const oneDayWeek = weeksBefore.find((week: any) => week.id === w1o);
  const multiW1Before = weeksBefore.find((week: any) => week.id === w1m);
  const multiW2Before = weeksBefore.find((week: any) => week.id === w2m);
  record(
    "5",
    "Next course stays locked until the previous course is complete",
    !oneDayWeek?.locked && !!multiW1Before?.locked && !!multiW2Before?.locked,
    `oneDayLocked=${!!oneDayWeek?.locked} multiW1=${!!multiW1Before?.locked} multiW2=${!!multiW2Before?.locked}`,
  );

  const oneDayQuiz = await jsonRequest(`/api/training-weeks/${w1o}/files/${oneDayFile.id}/quiz`, teacherCookie);
  const oneDayQuestions = oneDayQuiz.json?.questions || generatedQuestions || manualQuestions;
  const oneDayAnswers = Object.fromEntries(oneDayQuestions.map((q: any) => [q.id, q.correctAnswer || "True"]));
  const submitOneDay = await jsonRequest(
    `/api/training-weeks/${w1o}/files/${oneDayFile.id}/submit-quiz`,
    teacherCookie,
    "POST",
    { questions: oneDayQuestions, answers: oneDayAnswers },
  );
  record("3", "Teacher can complete a quiz", submitOneDay.status === 200 && submitOneDay.json?.passed === true, `HTTP ${submitOneDay.status} passed=${submitOneDay.json?.passed}`);

  const batchesAfterOne = await jsonRequest("/api/admin/analytics/batches", adminCookie);
  const batchRow = (Array.isArray(batchesAfterOne.json) ? batchesAfterOne.json : []).find((row: any) => row.id === batchId);
  const notBogusAtRisk = batchRow && batchRow.status !== "at-risk";
  const courseOverview = await jsonRequest("/api/analytics/course-completion", adminCookie);
  const oneDayCompletion = (Array.isArray(courseOverview.json) ? courseOverview.json : []).find((row: any) => row.courseId === oneDayId && row.batchId === batchId);
  const namedTeacher = (oneDayCompletion?.completedTeachers || []).some((t: any) => /PDF Check Teacher/i.test(t.name));
  record(
    "1",
    "Completed one-day course is not shown as At Risk",
    !!notBogusAtRisk && oneDayCompletion?.completedCount >= 1,
    `status=${batchRow?.status || "n/a"} completed=${oneDayCompletion?.completedCount ?? 0} pct=${oneDayCompletion?.completionPercentage ?? "n/a"}`,
  );
  record(
    "1",
    "Dashboard names which teachers completed the course",
    namedTeacher,
    `teachers=${(oneDayCompletion?.completedTeachers || []).map((t: any) => t.name).join(", ") || "none"}`,
  );

  const progress = await jsonRequest(`/api/batches/${batchId}/progress`, adminCookie);
  const teacherProgress = (Array.isArray(progress.json) ? progress.json : [])[0];
  const quizzesPassed = teacherProgress?.reportCard?.totalQuizzesPassed || 0;
  const coursesOnProgress = (teacherProgress?.courseCompletions || []).map((c: any) => `${c.courseName}:${c.status}`).join("; ");
  record(
    "3",
    "Admin/trainer progress shows the teacher's quiz completion",
    quizzesPassed >= 1,
    `quizzesPassed=${quizzesPassed} courses=${coursesOnProgress || "none"}`,
  );
  const teacherCard = await jsonRequest("/api/teacher/report-card", teacherCookie);
  record(
    "3",
    "Teacher dashboard report card also shows the quiz",
    (teacherCard.json?.totalQuizzesPassed || 0) >= 1,
    `teacherPassed=${teacherCard.json?.totalQuizzesPassed ?? 0}`,
  );

  const assignedAfterOneDay = await jsonRequest("/api/teacher/assigned-weeks", teacherCookie);
  const multiAfterOneDay = (Array.isArray(assignedAfterOneDay.json) ? assignedAfterOneDay.json : []);
  const multiW1Mid = multiAfterOneDay.find((week: any) => week.id === w1m);
  const multiW2Mid = multiAfterOneDay.find((week: any) => week.id === w2m);
  record(
    "5",
    "After course 1, week 1 of course 2 is open and week 2 is still locked",
    multiW1Mid && multiW1Mid.locked === false && multiW2Mid && multiW2Mid.locked === true,
    `multiW1locked=${multiW1Mid?.locked} multiW2locked=${multiW2Mid?.locked}`,
  );

  const week2Blocked = await jsonRequest(`/api/teachers/weeks/${w2m}/content`, teacherCookie);
  record(
    "5",
    "Week 2 content API is blocked before the week 1 quiz is passed",
    week2Blocked.status === 403 && week2Blocked.json?.locked === true,
    `HTTP ${week2Blocked.status} locked=${week2Blocked.json?.locked}`,
  );

  const submitMultiW1 = await jsonRequest(
    `/api/training-weeks/${w1m}/files/${multiW1File.id}/submit-quiz`,
    teacherCookie,
    "POST",
    { questions: manualQuestions, answers: Object.fromEntries(manualQuestions.map(q => [q.id, q.correctAnswer])) },
  );
  const assignedAfter = await jsonRequest("/api/teacher/assigned-weeks", teacherCookie);
  const afterW1 = Array.isArray(assignedAfter.json) ? assignedAfter.json : [];
  const multiW2After = afterW1.find((week: any) => week.id === w2m);
  const multiW3AfterW1 = afterW1.find((week: any) => week.id === w3m);
  const week2ContentAfter = await jsonRequest(`/api/teachers/weeks/${w2m}/content`, teacherCookie);
  record(
    "5",
    "Week 2 unlocks after week 1 is completed and the quiz is passed",
    submitMultiW1.json?.passed === true && multiW2After && multiW2After.locked === false && week2ContentAfter.status === 200,
    `pass=${submitMultiW1.json?.passed} week2locked=${multiW2After?.locked} content=${week2ContentAfter.status}`,
  );
  record(
    "5",
    "Week 3 stays locked until week 2 is complete",
    !!multiW3AfterW1?.locked,
    `week3locked=${multiW3AfterW1?.locked}`,
  );

  const submitMultiW2 = await jsonRequest(
    `/api/training-weeks/${w2m}/files/${multiW2File.id}/submit-quiz`,
    teacherCookie,
    "POST",
    { questions: week2Quiz, answers: Object.fromEntries(week2Quiz.map(q => [q.id, q.correctAnswer])) },
  );
  const assignedAfterW2 = await jsonRequest("/api/teacher/assigned-weeks", teacherCookie);
  const afterW2 = Array.isArray(assignedAfterW2.json) ? assignedAfterW2.json : [];
  const multiW3AfterW2 = afterW2.find((week: any) => week.id === w3m);
  record(
    "5",
    "Later weeks unlock after the previous module and quiz",
    submitMultiW2.json?.passed === true && multiW3AfterW2 && multiW3AfterW2.locked === false,
    `week2pass=${submitMultiW2.json?.passed} week3locked=${multiW3AfterW2?.locked}`,
  );

  await jsonRequest(
    `/api/training-weeks/${w3m}/files/${multiW3File.id}/submit-quiz`,
    teacherCookie,
    "POST",
    { questions: week2Quiz, answers: Object.fromEntries(week2Quiz.map(q => [q.id, q.correctAnswer])) },
  );
  const afterAll = await jsonRequest("/api/analytics/course-completion", adminCookie);
  const multiDone = (Array.isArray(afterAll.json) ? afterAll.json : []).find((row: any) => row.courseId === multiDayId && row.batchId === batchId);
  record(
    "1",
    "Completed multi-day course is also reflected immediately",
    (multiDone?.completedCount || 0) >= 1 && multiDone?.completionPercentage === 100,
    `completed=${multiDone?.completedCount ?? 0} pct=${multiDone?.completionPercentage ?? "n/a"}`,
  );

  const engagement = await jsonRequest("/api/analytics/course-completion", adminCookie);
  const rows = Array.isArray(engagement.json) ? engagement.json : [];
  const hasCourseNames = rows.some((row: any) => row.courseId === oneDayId) && rows.some((row: any) => row.courseId === multiDayId);
  const hasPercent = rows.every((row: any) => typeof row.completionPercentage === "number");
  const hasWho = rows.some((row: any) => (row.completedTeachers || []).length > 0);
  record(
    "4",
    "Engagement shows each course, who completed it, and completion %",
    hasCourseNames && hasPercent && hasWho,
    `courses=${rows.length} named=${hasWho} sample=${rows.map((r: any) => `${r.courseName}:${r.completedCount}/${r.enrolled}`).join(" | ")}`,
  );
  const weeklyPhrase = JSON.stringify(rows).match(/0\/5 weeks|1\/5 weeks/i);
  record(
    "4",
    "Completion is not assumed to be a 5-week programme",
    !weeklyPhrase,
    weeklyPhrase ? `found ${weeklyPhrase[0]}` : "no weekly 0/5 phrasing in course completion API",
  );

  printSummary(checks);
  if (checks.some(check => !check.ok && check.id !== "setup")) process.exit(1);
  if (checks.some(check => check.id === "setup" && !check.ok)) process.exit(1);
}

function printSummary(checks: Check[]) {
  const byId = new Map<string, Check[]>();
  for (const check of checks) {
    const list = byId.get(check.id) || [];
    list.push(check);
    byId.set(check.id, list);
  }
  console.log("\nPDF requirement results");
  for (const id of ["1", "2", "3", "4", "5"]) {
    const group = byId.get(id) || [];
    const ok = group.length > 0 && group.every(item => item.ok);
    console.log(`${ok ? "DONE" : "NOT DONE"}  PDF ${id}  ${group.filter(item => item.ok).length}/${group.length} checks passed`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
