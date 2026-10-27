import assert from 'node:assert/strict'
import test from 'node:test'
import {
    assignedQuizStanding,
    attemptQuizView,
    learnerQuestions,
    lessonQuizForViewer,
} from '../../../server/learnerQuiz.ts'
import { QUIZ_ATTEMPTS } from '../../../shared/constants.ts'

/** What a learner receives of a quiz: no answer in any field, and never a draft (Track B; D5). */

const KEY = [
    { id: 'q1', question: 'Two plus two?', type: 'multiple_choice', options: ['3', '4'], correctAnswer: '4', timeLimit: 30, explanation: 'Count them.' },
    { id: 'q2', question: 'The sky is green.', type: 'true_false', options: ['True', 'False'], correctAnswer: 'False', rationale: 'It is blue.' },
    { id: 'q3', question: 'Explain a lesson plan.', type: 'open_ended', options: [], correctAnswer: 'A plan has aims.' },
] as any[]

const BANNED = ['correctAnswer', 'explanation', 'rationale', 'answer']

function keysDeep(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((item) => keysDeep(item, out))
    else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
            out.push(key)
            keysDeep(inner, out)
        }
    }
    return out
}

function assertNoAnswer(value: unknown) {
    const keys = keysDeep(value)
    for (const banned of BANNED) assert.ok(!keys.includes(banned), `learner view still has ${banned}`)
    const text = JSON.stringify(value)
    for (const secret of ['Count them.', 'It is blue.', 'A plan has aims.']) assert.ok(!text.includes(secret), `learner view leaks "${secret}"`)
}

test('the learner projection carries no answer in any field', () => {
    assertNoAnswer(learnerQuestions(KEY))
})

test('a learner reading an approved module quiz gets the questions without answers', () => {
    const view = lessonQuizForViewer({ approved: true, questions: KEY }, false)
    assert.ok(view)
    assert.equal(view.questions.length, 3)
    assert.equal(view.approved, true)
    assertNoAnswer(view)
})

test('a cache hit never serves an unapproved quiz to a learner', () => {
    assert.equal(lessonQuizForViewer({ approved: false, questions: KEY }, false), null)
    assert.equal(lessonQuizForViewer({ approved: null, questions: KEY }, false), null)
    assert.equal(lessonQuizForViewer({ approved: true, questions: [] }, false), null)
    assert.equal(lessonQuizForViewer(undefined, false), null)
})

test('staff preview a draft with its answers', () => {
    const view = lessonQuizForViewer({ approved: false, questions: KEY }, true)
    assert.ok(view)
    assert.equal(view.approved, false)
    assert.equal((view.questions[0] as any).correctAnswer, '4')
})

const quiz = { id: 'aq1', title: 'Module 1 exam', passMark: 80, questions: KEY }
const attempt = (score: number, totalQuestions = 10) => ({ score, totalQuestions })

test('attempt reads hide answers while the teacher can still retake', () => {
    for (const attempts of [[], [attempt(5)], Array.from({ length: QUIZ_ATTEMPTS - 1 }, () => attempt(7))]) {
        const standing = assignedQuizStanding(attempts, 80)
        assert.equal(standing.canRetake, true)
        assertNoAnswer(attemptQuizView(quiz, standing))
    }
})

test('attempt reads show answers once the teacher has passed', () => {
    const standing = assignedQuizStanding([attempt(5), attempt(8)], 80)
    assert.equal(standing.hasPassed, true)
    assert.equal(standing.canRetake, false)
    assert.equal(attemptQuizView(quiz, standing).questions[0].correctAnswer, '4')
})

test('attempt reads show answers once every attempt is used', () => {
    const standing = assignedQuizStanding(Array.from({ length: QUIZ_ATTEMPTS }, () => attempt(5)), 80)
    assert.equal(standing.hasPassed, false)
    assert.equal(standing.remainingAttempts, 0)
    assert.equal(attemptQuizView(quiz, standing).questions[0].correctAnswer, '4')
})

test('a pass is read at the quiz\'s own pass mark, not a fixed 80', () => {
    assert.equal(assignedQuizStanding([attempt(6)], 60).hasPassed, true)
    assert.equal(assignedQuizStanding([attempt(8)], 90).hasPassed, false)
    assert.equal(assignedQuizStanding([attempt(9)], 90).hasPassed, true)
})
