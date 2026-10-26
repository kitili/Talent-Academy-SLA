import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreQuizSubmission } from '../../../server/progressLogic.ts'
import {
    ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT,
    MODULE_QUIZ_PASS_PERCENT,
    QUIZ_ATTEMPTS,
} from '../../../shared/constants.ts'

/** C1 (D3): module quizzes pass at 80%, scored by the scorer both module-quiz submit routes call. */

function quizWithRight(right: number, total: number) {
    const questions = Array.from({ length: total }, (_, index) => ({
        id: `q${index}`,
        type: 'multiple_choice',
        correctAnswer: 'A',
    }))
    const answers = Object.fromEntries(questions.map((question, index) => [question.id, index < right ? 'A' : 'B']))
    return scoreQuizSubmission(questions, answers)
}

test('the approved pass marks and attempts', () => {
    assert.equal(MODULE_QUIZ_PASS_PERCENT, 80)
    assert.equal(ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT, 80)
    assert.equal(QUIZ_ATTEMPTS, 3)
})

test('79% fails and 80% passes a module quiz', () => {
    const below = quizWithRight(79, 100)
    assert.equal(below.percentage, 79)
    assert.equal(below.passed, false)

    const at = quizWithRight(80, 100)
    assert.equal(at.percentage, 80)
    assert.equal(at.passed, true)
})

test('the boundary holds on small quizzes, where rounding would hide it', () => {
    assert.equal(quizWithRight(4, 5).passed, true, '4 of 5 is exactly 80%')
    assert.equal(quizWithRight(3, 4).passed, false, '3 of 4 is 75%')
    assert.equal(quizWithRight(7, 9).passed, false, '7 of 9 is 77.8% and rounds to 78')
    assert.equal(quizWithRight(8, 10).passed, true)
})

test('open-ended questions do not count towards the pass mark', () => {
    const result = scoreQuizSubmission(
        [
            { id: 'a', type: 'multiple_choice', correctAnswer: 'A' },
            { id: 'b', type: 'multiple_choice', correctAnswer: 'A' },
            { id: 'c', type: 'multiple_choice', correctAnswer: 'A' },
            { id: 'd', type: 'multiple_choice', correctAnswer: 'A' },
            { id: 'e', type: 'multiple_choice', correctAnswer: 'A' },
            { id: 'f', type: 'open_ended', correctAnswer: '' },
        ],
        { a: 'A', b: 'A', c: 'A', d: 'A', e: 'B', f: '' }
    )
    assert.equal(result.totalQuestions, 5)
    assert.equal(result.passed, true)
})
