import assert from 'node:assert/strict'
import test from 'node:test'
import { cohortPath, teacherModuleAccess } from '../../../server/learnerPath.ts'
import { cohort, handler, readersFor, source, type PathFacts } from './pathRows.ts'

/**
 * D1: course order (and so the course lock) comes from the cohort's steps through `cohortCourseOrder`,
 * not from `assigned_at`. N4: the content route refuses a locked module, a draft course and a Fellow
 * in no open cohort that holds the course.
 */

const placedFirst = 'early-placed'
const placedLast = 'late-placed'
const base = (overrides: Partial<PathFacts> = {}): PathFacts => ({
    courses: [
        { id: placedFirst, name: 'Placed first' },
        { id: placedLast, name: 'Placed last' },
    ],
    // assigned_at puts `early-placed` first; the steps put `late-placed` first.
    placements: [
        { courseId: placedFirst, assignedAt: '2026-01-01T00:00:00Z' },
        { courseId: placedLast, assignedAt: '2026-02-01T00:00:00Z' },
    ],
    steps: [
        { id: 's1', orderIndex: 0, courses: [placedLast] },
        { id: 's2', orderIndex: 1, courses: [placedFirst] },
    ],
    modules: {
        [placedFirst]: [{ id: 'a1', weekNumber: 1, deckFiles: [{ id: 'fa' }] }],
        [placedLast]: [{ id: 'b1', weekNumber: 1, deckFiles: [{ id: 'fb' }] }],
    },
    approved: ['a1/fa', 'b1/fb'],
    enrolledIn: { [placedFirst]: [cohort], [placedLast]: [cohort] },
    ...overrides,
})

test('step order sets the lock: the course on the first step is open, the next is locked', async () => {
    const path = await cohortPath('t1', cohort, readersFor(base()))
    assert.deepEqual(path.courseIds, [placedLast, placedFirst])
    const locked = Object.fromEntries(path.modules.map((mod) => [mod.courseId, mod.locked]))
    assert.equal(locked[placedLast], false)
    assert.equal(locked[placedFirst], true, 'assigned_at order would have opened this one')
    assert.equal(path.nextToCheck, placedLast)
})

test('the next course opens once the course before it in step order is complete', async () => {
    const path = await cohortPath('t1', cohort, readersFor(base({ passed: ['b1/fb'] })))
    assert.equal(path.modules.find((mod) => mod.courseId === placedFirst)?.locked, false)
})

test('the content route refuses a module whose course is locked by step order', async () => {
    const access = await teacherModuleAccess('t1', { id: 'a1', courseId: placedFirst }, readersFor(base()))
    assert.equal(access.ok, false)
    assert.equal(!access.ok && access.refusal.body.code, 'MODULE_LOCKED')
    const open = await teacherModuleAccess('t1', { id: 'b1', courseId: placedLast }, readersFor(base()))
    assert.equal(open.ok, true)
})

test('a course marked complete opens the next without its files being read again', async () => {
    const readers = readersFor(base({ checked: [placedLast] }))
    const progressForModule = readers.progressForModule
    readers.progressForModule = async (teacherId, moduleId) => {
        if (moduleId === 'b1') throw new Error('the checked course was read')
        return progressForModule(teacherId, moduleId)
    }
    const access = await teacherModuleAccess('t1', { id: 'a1', courseId: placedFirst }, readers)
    assert.equal(access.ok, true)
})

test('the content route refuses a Fellow in no open cohort that holds the course, and a draft course', async () => {
    const notEnrolled = await teacherModuleAccess('t1', { id: 'b1', courseId: placedLast }, readersFor(base({ enrolledIn: {} })))
    assert.equal(!notEnrolled.ok && notEnrolled.refusal.body.code, 'NOT_ENROLLED')
    const draft = base()
    draft.courses = draft.courses.map((course) => course.id === placedLast ? { ...course, publishStatus: 'draft' } : course)
    const refused = await teacherModuleAccess('t1', { id: 'b1', courseId: placedLast }, readersFor(draft))
    assert.equal(!refused.ok && refused.refusal.status, 404)
})

test('a closed cohort locks every module', async () => {
    const path = await cohortPath('t1', { id: 'cohort-1', status: 'closed' }, readersFor(base()))
    assert.equal(path.modules.every((mod) => mod.locked), true)
    assert.equal(path.nextToCheck, null)
})

// Text contract: proves the routes call the gate; it cannot catch a wrong id passed in.
test('the content GET and mark read both gate on teacherModuleAccess', () => {
    const routes = source('server/routes.ts')
    for (const start of ['app.get("/api/teachers/weeks/:weekId/content"', 'app.post("/api/teachers/weeks/:weekId/content/:deckFileId/viewed"']) {
        assert.match(handler(routes, start), /const access = await teacherModuleAccess\(teacherId, week\);\r?\n\s*if \(!access\.ok\) return res\.status\(access\.refusal\.status\)\.json\(access\.refusal\.body\);/, start)
    }
})
