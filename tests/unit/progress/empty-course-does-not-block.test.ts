import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCourseCompletion } from '../../../server/completion.ts'
import { cohortCourseFigures, cohortPath, completionRowFor, courseCheckRefusal } from '../../../server/learnerPath.ts'
import { cohort, readersFor, type PathFacts } from './pathRows.ts'

/**
 * A course with no modules is never complete (C2), and, following D6 ("missing trainer work never blocks
 * the Fellow"), it does not block the next course in the lock either. Applied in `cohortPath`.
 */

const facts = (overrides: Partial<PathFacts> = {}): PathFacts => ({
    courses: [
        { id: 'empty', name: 'No modules yet' },
        { id: 'next', name: 'Next course' },
    ],
    placements: [
        { courseId: 'empty', assignedAt: '2026-01-01T00:00:00Z' },
        { courseId: 'next', assignedAt: '2026-02-01T00:00:00Z' },
    ],
    modules: { empty: [], next: [{ id: 'n1', weekNumber: 1, deckFiles: [{ id: 'f' }] }] },
    approved: ['n1/f'],
    ...overrides,
})

test('a course with no modules does not lock the course after it', async () => {
    const path = await cohortPath('t1', cohort, readersFor(facts()))
    assert.equal(path.modules.find((mod) => mod.courseId === 'next')?.locked, false)
})

test('a course with no modules is never offered for checking, and the next course is', async () => {
    const path = await cohortPath('t1', cohort, readersFor(facts()))
    assert.deepEqual(path.courseIds, ['next'])
    assert.equal(path.nextToCheck, 'next')
})

test('a course with no modules is never marked complete', async () => {
    const readers = readersFor(facts())
    const completion = await computeCourseCompletion('t1', 'empty', readers)
    assert.equal(completion.complete, false)
    assert.equal(completionRowFor(completion, new Date()).status, 'in_progress')
    const path = await cohortPath('t1', cohort, readers)
    const refused = courseCheckRefusal({ courseId: 'empty', placed: true, path, completion })
    assert.equal(refused?.body.code, 'COURSE_INCOMPLETE')
})

test('a course with no modules is left out of the trainer figures', async () => {
    const figures = cohortCourseFigures(await cohortPath('t1', cohort, readersFor(facts({ passed: ['n1/f'] }))))
    assert.equal(figures.courses.length, 1)
    assert.equal(figures.overallPercentage, 100)
})

test('a draft course does not block the course after it', async () => {
    const draft = facts({ modules: { empty: [{ id: 'd1', weekNumber: 1, deckFiles: [{ id: 'g' }] }], next: [{ id: 'n1', weekNumber: 1, deckFiles: [{ id: 'f' }] }] } })
    draft.courses = draft.courses.map((course) => course.id === 'empty' ? { ...course, publishStatus: 'draft' } : course)
    const path = await cohortPath('t1', cohort, readersFor(draft))
    assert.deepEqual(path.courseIds, ['next'])
    assert.equal(path.modules.find((mod) => mod.courseId === 'next')?.locked, false)
})
