import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  answerReview,
  courseQuizzesPassed,
  gradeLessonQuiz,
  learnerQuestions,
  learnerQuiz,
  lessonQuizStates,
  teacherMayCheckCourse,
  type LessonQuizSource,
} from "../server/learnerQuiz.ts";
import { teacherMayTakeQuiz } from "../server/cohortAccess.ts";
import { scoreQuizSubmission } from "../server/progressLogic.ts";

// Normalised once so the text contracts below match on Windows (CRLF) checkouts too.
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const routes = read("server/routes.ts");

/** The source of one route handler, from its registration to the next one. A text contract, not a behaviour test. */
function handler(registration: string) {
  const start = routes.indexOf(registration);
  assert.ok(start >= 0, `route not found: ${registration}`);
  const next = routes.indexOf("\n  app.", start + registration.length);
  return routes.slice(start, next < 0 ? undefined : next);
}

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, out));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      out.push(key);
      keysDeep(inner, out);
    }
  }
  return out;
}

const KEY = [
  { id: "q1", question: "Two plus two?", type: "multiple_choice", options: ["3", "4", "5", "6"], correctAnswer: "4", timeLimit: 30, explanation: "Count them." },
  { id: "q2", question: "The sky is green.", type: "true_false", options: ["True", "False"], correctAnswer: "False", timeLimit: 30, rationale: "It is blue." },
  { id: "q3", question: "Ten minus one?", type: "multiple_choice", options: ["8", "9"], correctAnswer: "9", timeLimit: 30 },
  { id: "q4", question: "Explain a lesson plan.", type: "open_ended", options: [], correctAnswer: "", timeLimit: 180 },
] as any[];

const APPROVED = { approved: true, questions: KEY };

describe("a teacher's view of a quiz", () => {
  it("carries no correct answer or explanation in any field", () => {
    const projected = learnerQuestions(KEY);
    const keys = keysDeep(projected);
    for (const banned of ["correctAnswer", "explanation", "rationale"]) {
      assert.ok(!keys.includes(banned), `teacher projection still has ${banned}`);
    }
    assert.ok(!JSON.stringify(projected).includes("Count them."));
    // What the quiz screen needs is still there.
    assert.deepEqual(projected[0], { id: "q1", question: "Two plus two?", type: "multiple_choice", options: ["3", "4", "5", "6"], timeLimit: 30 });
  });

  it("strips answers from an assigned quiz record and keeps the rest", () => {
    const quiz = learnerQuiz({ id: "aq1", title: "Module 1", passMark: 80, questions: KEY });
    assert.equal(quiz.title, "Module 1");
    assert.equal(quiz.questions!.length, 4);
    assert.ok(!keysDeep(quiz).includes("correctAnswer"));
  });

  it("reveals which answers were right, and the correct answer only after a pass", () => {
    const answers = { q1: "3", q2: "False", q3: "9", q4: "A plan" };
    const failed = answerReview(KEY, answers, false);
    assert.deepEqual(failed.map((item) => item.correct), [false, true, true, null]);
    assert.ok(!keysDeep(failed).includes("correctAnswer"));
    const passed = answerReview(KEY, answers, true);
    assert.equal(passed[0].correctAnswer, "4");
    assert.equal(passed[3].correctAnswer, undefined);
  });
});

describe("lesson quiz grading on the server", () => {
  it("scores a forged submit against the stored quiz, not the questions in the body", () => {
    // A forged body: its own questions mark every chosen (wrong) answer right.
    const answers = { q1: "3", q2: "True", q3: "8", q4: "anything" };
    const forged = KEY.map((question) => ({ ...question, correctAnswer: question.type === "open_ended" ? "" : answers[question.id as keyof typeof answers] }));
    assert.equal(scoreQuizSubmission(forged, answers).passed, true, "the forgery would pass if the body were trusted");

    const result = gradeLessonQuiz({ cached: APPROVED, answers, staff: false });
    assert.ok(!("error" in result));
    assert.equal(result.graded.passed, false);
    assert.equal(result.graded.score, 0);
    assert.equal(result.questions, KEY);
  });

  it("passes a teacher who gives the stored answers", () => {
    const result = gradeLessonQuiz({ cached: APPROVED, answers: { q1: "4", q2: "False", q3: "9", q4: "x" }, staff: false });
    assert.ok(!("error" in result));
    assert.equal(result.graded.passed, true);
    assert.equal(result.review[0].correctAnswer, "4");
  });

  it("refuses a teacher when the lesson has no approved quiz", () => {
    for (const cached of [undefined, null, { approved: false, questions: KEY }, { approved: true, questions: [] }]) {
      const result = gradeLessonQuiz({ cached, answers: { q1: "4" }, staff: false });
      assert.ok("error" in result, `accepted ${JSON.stringify(cached)}`);
      assert.equal(result.status, 404);
      assert.equal(result.error, "This lesson has no approved quiz yet");
    }
  });

  it("lets staff grade an unapproved preview", () => {
    const result = gradeLessonQuiz({ cached: { approved: false, questions: KEY }, answers: { q1: "4" }, staff: true });
    assert.ok(!("error" in result));
  });

  it("refuses a body with no answers object", () => {
    const result = gradeLessonQuiz({ cached: APPROVED, answers: undefined, staff: false });
    assert.ok("error" in result);
    assert.equal(result.error, "Invalid quiz submission");
  });
});

describe("checking a course complete", () => {
  const lesson = (fileId: string, hasApprovedQuiz: boolean, passed: boolean) => ({ weekId: "w1", fileId, hasApprovedQuiz, passed });

  it("refuses at 0 of N approved-quiz lessons passed", () => {
    assert.equal(courseQuizzesPassed([lesson("a", true, false), lesson("b", true, false), lesson("c", true, false)]), false);
  });

  it("refuses while any approved-quiz lesson is unpassed", () => {
    assert.equal(courseQuizzesPassed([lesson("a", true, true), lesson("b", true, false)]), false);
  });

  it("accepts at N of N", () => {
    assert.equal(courseQuizzesPassed([lesson("a", true, true), lesson("b", true, true)]), true);
  });

  it("is not blocked by a lesson with no approved quiz", () => {
    assert.equal(courseQuizzesPassed([lesson("a", true, true), lesson("b", false, false)]), true);
  });

  function source(cache: Record<string, { approved: boolean; questions: any[] } | undefined>, passed: string[]): LessonQuizSource {
    return {
      getWeeksForCourse: async () => [
        { id: "w1", deckFiles: [{ id: "f1" }, { id: "f2" }] },
        { id: "w2", deckFiles: [{ id: "f3" }] },
        { id: "w3", deckFiles: null },
      ],
      getCachedQuiz: async (weekId, fileId) => cache[`${weekId}/${fileId}`],
      hasPassedFileQuiz: async (weekId, fileId) => passed.includes(`${weekId}/${fileId}`),
    };
  }

  it("reads every lesson file of the course and counts only approved quizzes with questions", async () => {
    const cache = {
      "w1/f1": { approved: true, questions: KEY },
      "w1/f2": { approved: false, questions: KEY },
      "w2/f3": { approved: true, questions: [] },
    };
    const states = await lessonQuizStates(source(cache, []), "c1", "t1");
    assert.deepEqual(states.map((state) => [state.fileId, state.hasApprovedQuiz]), [["f1", true], ["f2", false], ["f3", false]]);
    assert.equal(await teacherMayCheckCourse(source(cache, []), "c1", "t1"), false);
    assert.equal(await teacherMayCheckCourse(source(cache, ["w1/f1"]), "c1", "t1"), true);
  });

  it("lets a course with no approved quizzes through, as today", async () => {
    assert.equal(await teacherMayCheckCourse(source({}, []), "c1", "t1"), true);
  });
});

describe("module quizzes outside a cohort", () => {
  it("refuses a teacher in no cohort for the course", () => {
    assert.equal(teacherMayTakeQuiz([]), "You are not in a cohort for this course");
  });
});

// Text contracts: these routes need the database, so they are guarded by what their source says, not by running them.
describe("route wiring (text contract)", () => {
  it("submit-quiz grades against the cached quiz and never reads questions from the body", () => {
    const body = handler('app.post("/api/training-weeks/:weekId/files/:fileId/submit-quiz"');
    assert.match(body, /gradeLessonQuiz\(\{\s*cached: await storage\.getCachedQuiz\(weekId, fileId\),\s*answers: req\.body\.answers,/);
    assert.doesNotMatch(body, /req\.body\.questions|\{\s*questions[^}]*\}\s*=\s*req\.body/);
    assert.doesNotMatch(body, /scoreQuizSubmission/);
    assert.match(body, /attempt: teacherId \? learnerQuiz\(attempt\) : attempt/);
  });

  it("the module quiz read projects questions for anyone but staff, and its assigned-quiz fallback is staff-only", () => {
    const body = handler('app.get("/api/training-weeks/:weekId/files/:fileId/quiz"');
    assert.match(body, /const isAdminOrTrainer = !req\.teacherId && /);
    // lessonQuizForViewer returns learnerQuestions for anyone but staff (tests/unit/quiz/learner-projection.test.ts).
    assert.match(body, /const view = lessonQuizForViewer\(cachedQuiz, isAdminOrTrainer\);/);
    const fallback = body.indexOf("if (!isAdminOrTrainer) {");
    assert.ok(fallback > 0 && fallback < body.indexOf(".from(assignedQuizzes)"), "fallback is not behind the staff check");
  });

  it("generate-quiz admits staff only", () => {
    assert.match(routes, /app\.post\("\/api\/training-weeks\/:weekId\/files\/:fileId\/generate-quiz", isAuthenticated, isTrainer,/);
    // isAuthenticated admits passport (staff) users only; teachers sign in with session.teacherId.
    assert.match(routes, /function isAuthenticated\(req: Request, res: Response, next: NextFunction\) \{\n  if \(req\.isAuthenticated\(\)\) \{/);
  });

  it("the three uncalled teacher content-quiz routes are gone", () => {
    for (const path of ["generate-quiz", "submit-quiz", "regenerate-quiz"]) {
      assert.ok(!routes.includes(`/api/teachers/weeks/:weekId/content/:deckFileId/${path}"`), `${path} is still registered`);
    }
  });

  it("every teacher read of an assigned quiz strips the answers until no retake is left", () => {
    assert.match(handler('app.get("/api/assigned-quizzes/:quizId", isTeacherAuthenticated'), /questions: learnerQuestions\(questions\)/);
    assert.match(handler('app.get("/api/teacher/quizzes"'), /\.\.\.learnerQuiz\(quiz\)/);
    // Attempt reads reveal answers only after a pass or the last attempt (Track B; attemptQuizView in tests/unit/quiz/).
    assert.match(handler('app.get("/api/assigned-quizzes/:quizId/attempts"'), /quiz: quiz \? attemptQuizView\(quiz, standing\) : quiz/);
    assert.match(handler('app.get("/api/teacher/quiz-attempts"'), /quiz: quiz \? attemptQuizView\(quiz, standing\) : null/);
    assert.match(handler('app.post("/api/assigned-quizzes/:quizId/submit"'), /review: answerReview\(quiz\.questions, answers, passed === "yes"\)/);
  });

  it("course complete and its dashboard flag use the same rule", () => {
    // Track C replaced the lesson-quiz rule with C3 (computeCourseCompletion); tests/unit/progress pins it.
    assert.match(handler('app.post("/api/teacher/courses/:courseId/complete"'), /const completion = await computeCourseCompletion\(teacherId, courseId\);/);
    const weeks = handler('app.get("/api/teacher/assigned-weeks"');
    assert.match(weeks, /const next = await nextCourseCompletion\(teacherId, path\.nextToCheck, readers\);/);
    assert.match(weeks, /canCheckComplete: [^\n]*next\?\.complete === true/);
  });

  it("teacher result screens take correctness from the submit response, not a local key", () => {
    const dialog = read("client/src/components/FileQuizDialog.tsx");
    const runner = read("client/src/components/QuizRunner.tsx");
    assert.doesNotMatch(dialog, /question\.correctAnswer/);
    assert.doesNotMatch(runner, /q\.correctAnswer/);
    assert.match(dialog, /submit-quiz`, \{\n\s*answers,\n\s*\}\)/);
  });
});
