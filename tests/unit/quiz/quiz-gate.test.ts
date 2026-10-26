import assert from 'node:assert/strict'
import test from 'node:test'
import { teacherMayTakeQuiz } from '../../../server/cohortAccess.ts'
import type { CompletionReaders } from '../../../server/completion.ts'
import { lessonQuizGate, quizGateReaders } from '../../../server/learnerQuiz.ts'
import type { ScopeReaders } from '../../../server/scope.ts'
import { REFUSALS } from '../../../shared/constants.ts'

/**
 * Who may submit a module quiz (Track B, N3): an open cohort for the course (C5), and an unlocked
 * module (C3, D1). The gate runs over the real C3 and C5 code with rows in memory.
 */

type Cohort = { id: string; status?: string; quizzesStatus?: string }

function world(input: {
    enrolled: Cohort[]
    holding: Record<string, string[]>
    placements: Record<string, Array<{ courseId: string; assignedAt: string }>>
    passed?: string[]
    read?: string[]
    approved?: string[]
}) {
    const modules: Record<string, Array<{ id: string; weekNumber: number; deckFiles: Array<{ id: string }> }>> = {
        c1: [{ id: 'n1', weekNumber: 1, deckFiles: [{ id: 'g1' }] }],
        c2: [
            { id: 'm2', weekNumber: 2, deckFiles: [{ id: 'f2' }] },
            { id: 'm1', weekNumber: 1, deckFiles: [{ id: 'f1' }] },
        ],
    }
    const approved = new Set(input.approved ?? ['n1/g1', 'm1/f1', 'm2/f2'])
    const passed = new Set(input.passed ?? [])
    const read = new Set(input.read ?? [])
    const completion: CompletionReaders = {
        modulesForCourse: async (courseId) => modules[courseId] ?? [],
        progressForModule: async (_teacherId, moduleId) =>
            [...read].filter((key) => key.startsWith(`${moduleId}/`)).map((key) => ({ deckFileId: key.split('/')[1], status: 'viewed' })),
        quizApproved: async (moduleId, fileId) => approved.has(`${moduleId}/${fileId}`),
        quizPassed: async (moduleId, fileId) => passed.has(`${moduleId}/${fileId}`),
    }
    const scope: ScopeReaders = {
        trainerCohorts: async () => [],
        cohortIdsHoldingCourse: async (courseId) => input.holding[courseId] ?? [],
        teacherCohorts: async () => input.enrolled,
        cohortSteps: async () => [],
        cohortPlacements: async (cohortId) => input.placements[cohortId] ?? [],
    }
    return quizGateReaders(completion, scope)
}

const order = { k1: [{ courseId: 'c1', assignedAt: '2026-01-01' }, { courseId: 'c2', assignedAt: '2026-02-01' }] }
const m1 = { id: 'm1', courseId: 'c2' }
const m2 = { id: 'm2', courseId: 'c2' }

test('a teacher in no cohort for the course is refused NOT_ENROLLED', async () => {
    const readers = world({ enrolled: [{ id: 'other' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1'] })
    assert.deepEqual(await lessonQuizGate('t1', m1, readers), { error: REFUSALS.NOT_ENROLLED, code: 'NOT_ENROLLED' })
})

test('a closed cohort does not count as enrolment', async () => {
    const readers = world({ enrolled: [{ id: 'k1', status: 'closed' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1'] })
    assert.equal((await lessonQuizGate('t1', m1, readers))?.code, 'NOT_ENROLLED')
})

test('a module on no course is refused NOT_ENROLLED', async () => {
    const readers = world({ enrolled: [{ id: 'k1' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1'] })
    assert.equal((await lessonQuizGate('t1', { id: 'loose', courseId: null }, readers))?.code, 'NOT_ENROLLED')
})

test('quizzes stopped in every cohort for the course still refuse, as before', async () => {
    const readers = world({ enrolled: [{ id: 'k1', quizzesStatus: 'stopped' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1'] })
    assert.deepEqual(await lessonQuizGate('t1', m1, readers), { error: 'Quizzes are stopped for this cohort' })
})

test('the module before is not complete: MODULE_LOCKED', async () => {
    const readers = world({ enrolled: [{ id: 'k1' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1'] })
    assert.deepEqual(await lessonQuizGate('t1', m2, readers), { error: REFUSALS.MODULE_LOCKED, code: 'MODULE_LOCKED' })
})

test('the module before is complete and the course before is complete: allowed', async () => {
    const readers = world({ enrolled: [{ id: 'k1' }], holding: { c2: ['k1'] }, placements: order, passed: ['n1/g1', 'm1/f1'] })
    assert.equal(await lessonQuizGate('t1', m2, readers), null)
    assert.equal(await lessonQuizGate('t1', m1, readers), null)
})

test('a lesson file with no approved quiz, marked read, completes the module before (D6, through C3)', async () => {
    const readers = world({
        enrolled: [{ id: 'k1' }], holding: { c2: ['k1'] }, placements: order,
        passed: ['n1/g1'], read: ['m1/f1'], approved: ['n1/g1', 'm2/f2'],
    })
    assert.equal(await lessonQuizGate('t1', m2, readers), null)
})

test('the course before in cohort order is not complete: MODULE_LOCKED on its first module', async () => {
    const readers = world({ enrolled: [{ id: 'k1' }], holding: { c2: ['k1'] }, placements: order })
    assert.equal((await lessonQuizGate('t1', m1, readers))?.code, 'MODULE_LOCKED')
})

test('one cohort where the course comes first is enough', async () => {
    const readers = world({
        enrolled: [{ id: 'k1' }, { id: 'k2' }],
        holding: { c2: ['k1', 'k2'] },
        placements: { ...order, k2: [{ courseId: 'c2', assignedAt: '2026-01-01' }] },
    })
    assert.equal(await lessonQuizGate('t1', m1, readers), null)
})

test('a cohort with quizzes stopped does not open the course for the gate', async () => {
    const readers = world({
        enrolled: [{ id: 'k1' }, { id: 'k2', quizzesStatus: 'stopped' }],
        holding: { c2: ['k1', 'k2'] },
        placements: { ...order, k2: [{ courseId: 'c2', assignedAt: '2026-01-01' }] },
    })
    assert.equal((await lessonQuizGate('t1', m1, readers))?.code, 'MODULE_LOCKED')
})

test('teacherMayTakeQuiz([]) refuses', () => {
    assert.equal(teacherMayTakeQuiz([]), 'You are not in a cohort for this course')
})
