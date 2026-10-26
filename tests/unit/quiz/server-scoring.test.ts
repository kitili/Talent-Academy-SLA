import assert from 'node:assert/strict'
import test from 'node:test'
import { gradeLessonQuiz } from '../../../server/learnerQuiz.ts'
import { scoreQuizSubmission } from '../../../server/progressLogic.ts'
import { MODULE_QUIZ_PASS_PERCENT } from '../../../shared/constants.ts'

/** A module-quiz submit is scored against the stored quiz, never the questions in the body (Track B). */

const KEY = Array.from({ length: 10 }, (_, index) => ({
    id: `q${index + 1}`,
    question: `Question ${index + 1}`,
    type: 'multiple_choice',
    options: ['right', 'wrong'],
    correctAnswer: 'right',
}))

const stored = { approved: true, questions: KEY }

test('a forged body with every answer "right" is scored against the cache and fails', () => {
    const answers = Object.fromEntries(KEY.map((question) => [question.id, 'wrong']))
    // The body a forger sends: its own key marks every chosen answer correct.
    const forged = KEY.map((question) => ({ ...question, correctAnswer: 'wrong' }))
    assert.equal(scoreQuizSubmission(forged, answers).passed, true, 'the forgery passes if the body is trusted')

    const result = gradeLessonQuiz({ cached: stored, answers, staff: false, questions: forged } as any)
    assert.ok(!('error' in result))
    assert.equal(result.graded.score, 0)
    assert.equal(result.graded.passed, false)
})

test('the stored quiz passes at the module pass mark and fails one answer below it', () => {
    const needed = Math.ceil((KEY.length * MODULE_QUIZ_PASS_PERCENT) / 100)
    const answersWith = (right: number) => Object.fromEntries(KEY.map((question, index) => [question.id, index < right ? 'right' : 'wrong']))

    const atMark = gradeLessonQuiz({ cached: stored, answers: answersWith(needed), staff: false })
    assert.ok(!('error' in atMark))
    assert.equal(atMark.graded.passed, true)

    const below = gradeLessonQuiz({ cached: stored, answers: answersWith(needed - 1), staff: false })
    assert.ok(!('error' in below))
    assert.equal(below.graded.passed, false)
    assert.ok(below.review.every((item) => item.correctAnswer === undefined), 'a failed attempt reveals no correct answer')
})

test('a learner cannot be scored against a draft', () => {
    const result = gradeLessonQuiz({ cached: { approved: false, questions: KEY }, answers: { q1: 'right' }, staff: false })
    assert.ok('error' in result)
    assert.equal(result.status, 404)
})
