import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { trainerOwnsBatch } from '../../../server/access.ts'
import {
    teacherCohortsForCourse,
    trainerCohortIds,
    trainerMayEditCourse,
    type ScopeReaders,
} from '../../../server/scope.ts'

/** C4 and C5 (D8, D2): one rule for a trainer's cohorts, and the resolvers built on it. */

const trainer = { id: 't1', role: 'trainer' }

test('a cohort_trainers row puts a cohort in scope', () => {
    assert.equal(trainerOwnsBatch(trainer, { trainerId: 't2', trainerIds: ['t1'] }), true)
})

test('batches.trainer_id puts a cohort in scope', () => {
    assert.equal(trainerOwnsBatch(trainer, { trainerId: 't1', trainerIds: [] }), true)
})

test('created_by alone does not put a cohort in scope', () => {
    const createdOnly = { trainerId: null, trainerIds: [], createdBy: 't1' }
    assert.equal(trainerOwnsBatch(trainer, createdOnly), false)
})

test('admins see every cohort; teachers and anonymous callers see none', () => {
    const cohort = { trainerId: 't2', trainerIds: ['t3'] }
    assert.equal(trainerOwnsBatch({ id: 'a', role: 'admin' }, cohort), true)
    assert.equal(trainerOwnsBatch({ id: 't2', role: 'teacher' }, cohort), false)
    assert.equal(trainerOwnsBatch(null, cohort), false)
    assert.equal(trainerOwnsBatch({ role: 'trainer' }, { trainerId: null, trainerIds: [] }), false, 'a trainer with no id')
})

test('the SQL twin in storage.getAllBatches uses the same two sources (text contract)', () => {
    // Reads source as text: it proves what getAllBatches says today, not that every reader calls it.
    const source = readFileSync('server/storage.ts', 'utf8')
    const body = source.match(/async getAllBatches\(trainerId\?: string\)[\s\S]*?\r?\n  }\r?\n/)?.[0] ?? ''
    assert.ok(body, 'getAllBatches not found')
    assert.match(body, /eq\(batches\.trainerId, trainerId\)/)
    assert.match(body, /from cohort_trainers where cohort_id = \$\{batches\.id\} and trainer_id = \$\{trainerId\}/)
    assert.doesNotMatch(body, /eq\(batches\.createdBy/)
})

function readers(rows: {
    trainerCohorts?: Record<string, string[]>
    holding?: Record<string, string[]>
    enrolled?: Record<string, Array<{ id: string; status?: string }>>
}): ScopeReaders {
    return {
        trainerCohorts: async (trainerId) => (rows.trainerCohorts?.[trainerId] ?? []).map((id) => ({ id })),
        cohortIdsHoldingCourse: async (courseId) => rows.holding?.[courseId] ?? [],
        teacherCohorts: async (teacherId) => rows.enrolled?.[teacherId] ?? [],
        cohortSteps: async () => [],
        cohortPlacements: async () => [],
    }
}

test('trainerCohortIds reads the trainer scope rows', async () => {
    assert.deepEqual(await trainerCohortIds('t1', readers({ trainerCohorts: { t1: ['k1', 'k2'] } })), ['k1', 'k2'])
    assert.deepEqual(await trainerCohortIds('', readers({ trainerCohorts: { '': ['k1'] } })), [])
})

test('trainerMayEditCourse: admin always; a trainer only for a course placed on a cohort they run', async () => {
    const rows = readers({ trainerCohorts: { t1: ['k1'] }, holding: { mine: ['k1', 'k9'], theirs: ['k9'], loose: [] } })
    assert.equal(await trainerMayEditCourse({ id: 'a', role: 'admin' }, 'theirs', rows), true)
    assert.equal(await trainerMayEditCourse(trainer, 'mine', rows), true)
    assert.equal(await trainerMayEditCourse(trainer, 'theirs', rows), false)
    assert.equal(await trainerMayEditCourse(trainer, 'loose', rows), false, 'a course on no cohort')
    assert.equal(await trainerMayEditCourse({ id: 't1', role: 'teacher' }, 'mine', rows), false)
    assert.equal(await trainerMayEditCourse(null, 'mine', rows), false)
})

test('teacherCohortsForCourse keeps only open cohorts that hold the course', async () => {
    const rows = readers({
        holding: { c: ['open', 'closed', 'plain'] },
        enrolled: {
            f1: [{ id: 'open', status: 'open' }, { id: 'closed', status: 'closed' }, { id: 'plain' }, { id: 'other', status: 'open' }],
        },
    })
    assert.deepEqual((await teacherCohortsForCourse('f1', 'c', rows)).map((cohort) => cohort.id), ['open', 'plain'])
    assert.deepEqual(await teacherCohortsForCourse('f2', 'c', rows), [], 'not enrolled anywhere')
    assert.deepEqual(await teacherCohortsForCourse('f1', 'none', rows), [], 'no cohort holds the course')
})
