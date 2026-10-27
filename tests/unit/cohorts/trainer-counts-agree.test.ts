import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { trainerOwnsBatch } from '../../../server/access.ts'
import { cohortsInScope, trainerCohortCounts } from '../../../server/cohortRoster.ts'
import type { ScopeReaders } from '../../../server/scope.ts'

/** D8, finding 15: People, the desk, the course-batches filter and the route guard count a trainer's cohorts one way (C4). */

const cohorts = [
    { id: 'c-assigned', trainerId: 't1', trainerIds: ['t1'], createdBy: 'admin' },
    { id: 'c-co-trainer', trainerId: 't2', trainerIds: ['t2', 't1'], createdBy: 'admin' },
    { id: 'c-created-only', trainerId: null, trainerIds: [], createdBy: 't1' },
    { id: 'c-other', trainerId: 't2', trainerIds: ['t2'], createdBy: 't1' },
]

// The guard's rule over the rows, standing in for storage.getAllBatches(trainerId), its SQL twin
// (pinned as text in tests/unit/contract/trainer-scope.test.ts).
const readers: ScopeReaders = {
    trainerCohorts: async (trainerId) => cohorts.filter((row) => trainerOwnsBatch({ id: trainerId, role: 'trainer' }, row)),
    cohortIdsHoldingCourse: async () => [],
    teacherCohorts: async () => [],
    cohortSteps: async () => [],
    cohortPlacements: async () => [],
}

function guardCount(trainerId: string) {
    return cohorts.filter((row) => trainerOwnsBatch({ id: trainerId, role: 'trainer' }, row)).length
}

test('the People count equals the cohorts the guard opens, and created_by counts for nothing', async () => {
    const counts = await trainerCohortCounts(['t1', 't2', 't3'], readers)
    assert.deepEqual(counts, { t1: 2, t2: 2, t3: 0 })
    for (const id of ['t1', 't2', 't3']) assert.equal(counts[id], guardCount(id), id)
})

test('the course-batches filter keeps the cohorts the guard opens', async () => {
    const t1 = { id: 't1', role: 'trainer' }
    const seen = await cohortsInScope(t1, cohorts, readers)
    assert.deepEqual(seen.map((row) => row.id), ['c-assigned', 'c-co-trainer'])
    assert.deepEqual(seen, cohorts.filter((row) => trainerOwnsBatch(t1, row)))
    assert.equal((await cohortsInScope({ id: 'a', role: 'admin' }, cohorts, readers)).length, cohorts.length)
    assert.deepEqual(await cohortsInScope({ id: 'f', role: 'teacher' }, cohorts, readers), [])
    assert.deepEqual(await cohortsInScope(undefined, cohorts, readers), [])
})

function block(source: string, start: RegExp) {
    const at = source.search(start)
    if (at < 0) return ''
    const rest = source.slice(at)
    const end = rest.search(/\r?\n  }\);?\r?\n/)
    return end < 0 ? rest : rest.slice(0, end)
}

test('People, trainer detail, course-batches, desk and analytics read trainer cohorts through C4 (text contract)', () => {
    // Reads source as text: it proves which function each reader calls, not what the database returns.
    const routes = readFileSync('server/routes.ts', 'utf8')
    const storage = readFileSync('server/storage.ts', 'utf8')
    const readersOfScope = {
        people: [block(routes, /app\.get\("\/api\/admin\/trainers",/), /trainerCohortCounts\(/],
        detail: [block(routes, /app\.get\("\/api\/admin\/trainers\/:id",/), /storage\.getAllBatches\(id\)/],
        courseBatches: [block(routes, /app\.get\("\/api\/courses\/:courseId\/batches",/), /cohortsInScope\(req\.user/],
        desk: [block(storage, /async getTrainerDesk\(/), /this\.getAllBatches\(trainerId\)/],
        analytics: [block(storage, /async getTrainerAnalytics\(/), /this\.getAllBatches\(trainerId\)/],
    } as const
    for (const [name, [body, call]] of Object.entries(readersOfScope)) {
        assert.ok(body, `${name} not found`)
        assert.match(body, call, `${name} does not read C4`)
        assert.doesNotMatch(body, /createdBy/, `${name} still reads created_by`)
    }
})

test('the People card shows a cohort count, with no files-completed label or 0/100 bar', () => {
    const page = readFileSync('client/src/pages/admin-trainers.tsx', 'utf8')
    assert.match(page, /trainer\.cohortCount/)
    assert.doesNotMatch(page, /filesCompleted|[Ff]iles completed|Has a cohort/)
    assert.doesNotMatch(page, /<Progress\b/)
})
