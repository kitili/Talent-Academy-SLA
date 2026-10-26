import assert from 'node:assert/strict'
import test from 'node:test'
import { cohortQuizSignals, cohortQuizSignalsFor } from '../../../server/learnerPath.ts'
import { cohortMedals } from '../../../shared/cohortMedals.ts'
import { handler, source } from './pathRows.ts'

/** Finding 22: a quiz answered or passed in cohort X earns nothing in cohort Y. */

const attempts = {
    moduleAttempts: [
        { weekId: 'x-module', passed: 'yes' },
        { weekId: 'x-module', passed: 'no' },
    ],
    examAttempts: [{ batchId: 'cohort-x', passed: 'yes' }],
}

test('module quizzes count in the cohort that holds the module, exams in the cohort they were set for', () => {
    const x = cohortQuizSignals({ cohortId: 'cohort-x', moduleIds: new Set(['x-module']), ...attempts })
    assert.deepEqual(x, { questionsAnswered: 3, quizzesPassed: 2 })
})

test('a quiz passed in cohort X earns nothing in cohort Y', async () => {
    const y = await cohortQuizSignalsFor('t1', 'cohort-y', [{ id: 'y-module' }], async () => attempts)
    assert.deepEqual(y, { questionsAnswered: 0, quizzesPassed: 0 })
    const medals = cohortMedals({
        progressPercentage: 0,
        coursesCompleted: 0,
        attendanceRate: 0,
        attendanceDays: 0,
        trainerStar: false,
        ...y,
    })
    for (const kind of ['first-step', 'questions', 'quiz-pass']) {
        assert.equal(medals.find((medal) => medal.kind === kind)?.earned, false, kind)
    }
})

// Text contract: proves the medal routes read per-cohort signals, not the academy-wide report card.
test('the Fellow medals and the trainer progress read per-cohort signals', () => {
    const routes = source('server/routes.ts')
    for (const start of ['app.get("/api/teacher/medals"', 'app.get("/api/batches/:batchId/progress"']) {
        const body = handler(routes, start)
        assert.match(body, /const signals = await cohortQuizSignalsFor\(/, start)
        assert.match(body, /questionsAnswered: signals\.questionsAnswered,\r?\n\s*quizzesPassed: signals\.quizzesPassed,/, start)
        assert.doesNotMatch(body, /questionsAnswered: reportCard/, start)
    }
})
