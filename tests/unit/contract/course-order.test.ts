import assert from 'node:assert/strict'
import test from 'node:test'
import { cohortCourseOrder, orderCohortCourses, type ScopeReaders } from '../../../server/scope.ts'

/** C5 (D1): steps order a cohort's courses; courses on no step follow by assigned_at. */

const placements = [
    { courseId: 'late-step', assignedAt: '2026-01-01T00:00:00Z' },
    { courseId: 'early-step-b', assignedAt: '2026-01-02T00:00:00Z' },
    { courseId: 'early-step-a', assignedAt: '2026-01-03T00:00:00Z' },
    { courseId: 'loose-new', assignedAt: '2026-03-01T00:00:00Z' },
    { courseId: 'loose-old', assignedAt: '2026-02-01T00:00:00Z' },
]

const steps = [
    { id: 's2', orderIndex: 2, courses: [{ courseId: 'late-step', orderIndex: 0 }] },
    {
        id: 's1',
        orderIndex: 1,
        courses: [
            { courseId: 'early-step-b', orderIndex: 1 },
            { courseId: 'early-step-a', orderIndex: 0 },
        ],
    },
]

test('step order first, then course order inside the step, then unplaced courses by assigned_at', () => {
    assert.deepEqual(orderCohortCourses(steps, placements), [
        'early-step-a',
        'early-step-b',
        'late-step',
        'loose-old',
        'loose-new',
    ])
})

test('assigned_at alone no longer decides the order of courses on steps', () => {
    const order = orderCohortCourses(steps, placements)
    assert.ok(order.indexOf('late-step') > order.indexOf('early-step-b'), 'late-step was assigned first but sits on a later step')
})

test('a step course with no placement on the cohort is left out', () => {
    const withGhost = [{ id: 's0', orderIndex: 0, courses: [{ courseId: 'ghost', orderIndex: 0 }] }, ...steps]
    assert.equal(orderCohortCourses(withGhost, placements).includes('ghost'), false)
})

test('with no steps, the order is assigned_at, as today', () => {
    assert.deepEqual(orderCohortCourses([], placements), ['late-step', 'early-step-b', 'early-step-a', 'loose-old', 'loose-new'])
})

test('cohortCourseOrder reads steps and placements for the cohort it is given', async () => {
    const seen: string[] = []
    const readers: ScopeReaders = {
        trainerCohorts: async () => [],
        cohortIdsHoldingCourse: async () => [],
        teacherCohorts: async () => [],
        cohortSteps: async (cohortId) => {
            seen.push(`steps:${cohortId}`)
            return steps
        },
        cohortPlacements: async (cohortId) => {
            seen.push(`placements:${cohortId}`)
            return placements
        },
    }
    assert.deepEqual(await cohortCourseOrder('k1', readers), orderCohortCourses(steps, placements))
    assert.deepEqual(seen.sort(), ['placements:k1', 'steps:k1'])
})
