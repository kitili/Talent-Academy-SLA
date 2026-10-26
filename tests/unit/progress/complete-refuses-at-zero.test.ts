import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCourseCompletion } from '../../../server/completion.ts'
import { cohortPath, courseCheckRefusal } from '../../../server/learnerPath.ts'
import { cohort, handler, readersFor, source, type PathFacts } from './pathRows.ts'

/**
 * Finding 1: POST /api/teacher/courses/:courseId/complete refuses unless C3 says the course is complete.
 * The route's rule is `courseCheckRefusal` fed by `cohortPath` and `computeCourseCompletion`; the
 * dashboard's `canCheckComplete` reads the same C3 result through `nextCourseCompletion`.
 */

const files = (moduleId: string) => [{ id: `${moduleId}-f` }]
const facts = (passed: string[]): PathFacts => ({
    courses: [{ id: 'c1', name: 'Course 1' }],
    placements: [{ courseId: 'c1', assignedAt: '2026-01-01T00:00:00Z' }],
    modules: {
        c1: [
            { id: 'm1', weekNumber: 1, deckFiles: files('m1') },
            { id: 'm2', weekNumber: 2, deckFiles: files('m2') },
            { id: 'm3', weekNumber: 3, deckFiles: files('m3') },
        ],
    },
    approved: ['m1/m1-f', 'm2/m2-f', 'm3/m3-f'],
    passed,
})

async function check(passed: string[]) {
    const readers = readersFor(facts(passed))
    const path = await cohortPath('t1', cohort, readers)
    const completion = await computeCourseCompletion('t1', 'c1', readers)
    return { completion, refused: courseCheckRefusal({ courseId: 'c1', placed: true, path, completion }) }
}

test('complete refuses at 0 of 3 modules with COURSE_INCOMPLETE', async () => {
    const { completion, refused } = await check([])
    assert.deepEqual(completion, { totalModules: 3, doneModules: 0, lessonFiles: 3, complete: false })
    assert.equal(refused?.status, 400)
    assert.equal(refused?.body.code, 'COURSE_INCOMPLETE')
})

test('complete refuses at 2 of 3 modules', async () => {
    const { refused } = await check(['m1/m1-f', 'm2/m2-f'])
    assert.equal(refused?.body.code, 'COURSE_INCOMPLETE')
})

test('complete accepts at 3 of 3 modules', async () => {
    const { completion, refused } = await check(['m1/m1-f', 'm2/m2-f', 'm3/m3-f'])
    assert.equal(completion.complete, true)
    assert.equal(refused, null)
})

test('complete refuses a course that is not placed on the cohort', async () => {
    const readers = readersFor(facts([]))
    const path = await cohortPath('t1', cohort, readers)
    const refused = courseCheckRefusal({ courseId: 'other', placed: false, path, completion: { complete: true } })
    assert.equal(refused?.status, 404)
})

// Text contract: proves only that the handler calls the rule; it cannot catch a wrong id passed in.
test('the complete route and the dashboard flag use C3, not the lesson-quiz rule', () => {
    const routes = source('server/routes.ts')
    const complete = handler(routes, 'app.post("/api/teacher/courses/:courseId/complete"')
    assert.match(complete, /const completion = await computeCourseCompletion\(teacherId, courseId\);/)
    assert.match(complete, /const refused = courseCheckRefusal\(\{ courseId, placed, path, completion \}\);\r?\n\s*if \(refused\) return res\.status\(refused\.status\)\.json\(refused\.body\);/)
    assert.doesNotMatch(complete, /teacherMayCheckCourse/)
    const weeks = handler(routes, 'app.get("/api/teacher/assigned-weeks"')
    assert.match(weeks, /const next = await nextCourseCompletion\(teacherId, path\.nextToCheck, readers\);/)
    assert.match(weeks, /canCheckComplete: week\.courseId === path\.nextToCheck && !week\.locked && next\?\.complete === true,/)
    assert.doesNotMatch(weeks, /teacherMayCheckCourse/)
})
