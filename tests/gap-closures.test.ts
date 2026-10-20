import test from "node:test";
import assert from "node:assert/strict";
import { normalizeManualQuestions } from "../server/quizService";
import { sendTransactionalEmail } from "../server/mailer";

test("manual questions keep a valid choice and drop a broken one", () => {
  const questions = normalizeManualQuestions([
    {
      id: "q1",
      type: "true_false",
      question: "Practice comes before the quiz.",
      options: ["True", "False"],
      correctAnswer: "True",
    },
    { question: "missing type" },
  ]);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].correctAnswer, "True");
});

test("email stays in the app when no mail key is set", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const result = await sendTransactionalEmail("teacher@test.com", "Next module is open", "Module 2 is ready.");
  assert.equal(result.skipped, true);
  if (previous) process.env.RESEND_API_KEY = previous;
});
