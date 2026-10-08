import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLessonHtml } from "../server/htmlSanitize";
import { signFileGrant, verifyFileGrant } from "../server/fileGrant";
import { passMarkOf, shuffleQuestions } from "../server/quizDelivery";

test("lesson html drops scripts and event handlers", () => {
  const clean = sanitizeLessonHtml(`<p onclick="alert(1)">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>`);
  assert.equal(clean.includes("script"), false);
  assert.equal(clean.includes("onclick"), false);
  assert.equal(clean.includes("javascript:"), false);
  assert.equal(clean.includes("<p>Hi</p>"), true);
});

test("file grants expire and reject a tampered signature", () => {
  const { exp, sig } = signFileGrant("files/deck.pptx", 1_000);
  assert.equal(verifyFileGrant("files/deck.pptx", exp, sig, 1_000), true);
  assert.equal(verifyFileGrant("files/deck.pptx", exp, sig, exp + 1), false);
  assert.equal(verifyFileGrant("files/other.pptx", exp, sig, 1_000), false);
});

test("pass mark stays inside 1 to 100 and shuffle keeps the answer text", () => {
  assert.equal(passMarkOf(undefined), 80);
  assert.equal(passMarkOf(150), 100);
  const [question] = shuffleQuestions([{
    id: "q1",
    question: "2+2",
    type: "multiple_choice",
    options: ["1", "4", "9"],
    correctAnswer: "4",
  }]);
  assert.equal(question.correctAnswer, "4");
  assert.deepEqual(question.options?.slice().sort(), ["1", "4", "9"]);
});
