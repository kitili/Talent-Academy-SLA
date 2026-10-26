import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCourseCompletion, type CompletionReaders } from '../../../server/completion.ts'
import { fileIsDone, isCourseComplete, moduleIsComplete } from '../../../server/progressLogic.ts'
import { COURSE_COMPLETE_PERCENT } from '../../../shared/constants.ts'

/** C2 and C3 (D4, D6): the completion rule and the resolver that computes it from rows. */

test('a lesson file with an approved quiz is done only when the quiz is passed', () => {
    assert.equal(fileIsDone({ hasApprovedQuiz: true, quizPassed: true, markedRead: false }), true)
    assert.equal(fileIsDone({ hasApprovedQuiz: true, quizPassed: false, markedRead: true }), false)
    assert.equal(fileIsDone({ hasApprovedQuiz: true, quizPassed: false, markedRead: false }), false)
})

test('a lesson file with no approved quiz is done once it is marked read', () => {
    assert.equal(fileIsDone({ hasApprovedQuiz: false, quizPassed: false, markedRead: true }), true)
    assert.equal(fileIsDone({ hasApprovedQuiz: false, quizPassed: false, markedRead: false }), false)
    assert.equal(fileIsDone({ hasApprovedQuiz: false, quizPassed: true, markedRead: false }), true)
})

test('a course is complete only at every module', () => {
    assert.equal(COURSE_COMPLETE_PERCENT, 100)
    assert.equal(isCourseComplete(2, 3), false, 'N-1 of N')
    assert.equal(isCourseComplete(9, 10), false, '90% used to pass')
    assert.equal(isCourseComplete(199, 200), false, '99.5% must not round up to 100')
    assert.equal(isCourseComplete(3, 3), true)
    assert.equal(isCourseComplete(0, 0), false, 'a course with no modules has nothing to finish')
})

test('a module with no lesson file is complete', () => {
    assert.equal(moduleIsComplete({ total: 0, completed: 0 }), true)
    assert.equal(moduleIsComplete({ total: 2, completed: 1 }), false)
})

type Facts = {
    modules: Array<{ id: string; deckFiles?: Array<{ id: string }> | null }>
    progress?: Record<string, Array<{ deckFileId: string; status?: string; viewedAt?: Date | null; completedAt?: Date | null }>>
    approved?: string[]
    passed?: string[]
}

function readersFor(facts: Facts): CompletionReaders {
    return {
        modulesForCourse: async () => facts.modules,
        progressForModule: async (_teacherId, moduleId) => facts.progress?.[moduleId] ?? [],
        quizApproved: async (moduleId, fileId) => (facts.approved ?? []).includes(`${moduleId}/${fileId}`),
        quizPassed: async (moduleId, fileId) => (facts.passed ?? []).includes(`${moduleId}/${fileId}`),
    }
}

test('computeCourseCompletion counts modules without files and refuses at N-1 of N', async () => {
    const modules = [
        { id: 'm1', deckFiles: [{ id: 'f1' }] },
        { id: 'm2', deckFiles: [] },
        { id: 'm3', deckFiles: [{ id: 'f3' }] },
    ]
    const nothing = await computeCourseCompletion('t', 'c', readersFor({ modules, approved: ['m1/f1', 'm3/f3'] }))
    assert.deepEqual(nothing, { totalModules: 3, doneModules: 1, complete: false })

    const almost = await computeCourseCompletion('t', 'c', readersFor({ modules, approved: ['m1/f1', 'm3/f3'], passed: ['m1/f1'] }))
    assert.deepEqual(almost, { totalModules: 3, doneModules: 2, complete: false })

    const all = await computeCourseCompletion('t', 'c', readersFor({ modules, approved: ['m1/f1', 'm3/f3'], passed: ['m1/f1', 'm3/f3'] }))
    assert.deepEqual(all, { totalModules: 3, doneModules: 3, complete: true })
})

test('computeCourseCompletion: marking read completes a file only when it has no approved quiz', async () => {
    const modules = [{ id: 'm1', deckFiles: [{ id: 'f1' }] }]
    const progress = { m1: [{ deckFileId: 'f1', status: 'viewed', viewedAt: new Date() }] }
    const noQuiz = await computeCourseCompletion('t', 'c', readersFor({ modules, progress }))
    assert.equal(noQuiz.complete, true)

    const withQuiz = await computeCourseCompletion('t', 'c', readersFor({ modules, progress, approved: ['m1/f1'] }))
    assert.equal(withQuiz.complete, false)
})

test('computeCourseCompletion: a quiz approved after the file was completed does not undo it', async () => {
    const modules = [{ id: 'm1', deckFiles: [{ id: 'f1' }, { id: 'f2' }] }]
    const progress = {
        m1: [
            { deckFileId: 'f1', status: 'completed', completedAt: new Date() },
            // A later `available` write keeps completed_at (storage.upsertTeacherContentProgress).
            { deckFileId: 'f2', status: 'available', completedAt: new Date() },
        ],
    }
    const result = await computeCourseCompletion('t', 'c', readersFor({ modules, progress, approved: ['m1/f1', 'm1/f2'] }))
    assert.deepEqual(result, { totalModules: 1, doneModules: 1, complete: true })
})

test('computeCourseCompletion ignores the stored completion status: a course with no modules is not complete', async () => {
    assert.deepEqual(await computeCourseCompletion('t', 'c', readersFor({ modules: [] })), {
        totalModules: 0,
        doneModules: 0,
        complete: false,
    })
})
