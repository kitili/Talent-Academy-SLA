import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    certificateRefusal,
    listEligibleFellows,
    readersFromRows,
    type EligibilityRows,
} from '../../../server/certificateEligibility.ts'
import { courseCompletionBody, wordingForIssue, CERTIFICATE_DESIGNS } from '../../../shared/certificateDesigns.ts'
import { REFUSALS } from '../../../shared/constants.ts'

/**
 * D4: certificates stay manual, but the server refuses a course certificate unless every module of the course is
 * complete (C3), and a Fellowship or Advanced certificate unless the academy path is done. D4b: the course wording
 * names the course only. The rules run on rows in memory through the same readers the admin list uses.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** One cohort with two steps; course c1 (three modules) on step 1, course c2 (one module) on step 2. */
function rows(passed: string[], overrides: Partial<EligibilityRows> = {}): EligibilityRows {
    return {
        fellows: [
            { id: 'fellow', name: 'Amina', approvalStatus: 'approved' },
            { id: 'gone', name: 'Old Fellow', approvalStatus: 'inactive' },
        ],
        courses: [{ id: 'c1', name: 'Lesson Planning' }, { id: 'c2', name: 'Lesson Delivery' }],
        enrolments: [
            { teacherId: 'fellow', cohort: { id: 'cohortA', status: 'open' } },
            { teacherId: 'gone', cohort: { id: 'cohortA', status: 'open' } },
        ],
        placements: [{ cohortId: 'cohortA', courseId: 'c1' }, { cohortId: 'cohortA', courseId: 'c2' }],
        steps: [
            { id: 's1', cohortId: 'cohortA', orderIndex: 0, courses: [{ courseId: 'c1', orderIndex: 0 }] },
            { id: 's2', cohortId: 'cohortA', orderIndex: 1, courses: [{ courseId: 'c2', orderIndex: 0 }] },
        ],
        modules: [
            { id: 'm1', courseId: 'c1', deckFiles: [{ id: 'f1' }] },
            { id: 'm2', courseId: 'c1', deckFiles: [{ id: 'f2' }] },
            { id: 'm3', courseId: 'c1', deckFiles: [{ id: 'f3' }] },
            { id: 'm4', courseId: 'c2', deckFiles: [{ id: 'f4' }] },
        ],
        progress: [],
        approvedQuizzes: ['m1/f1', 'm2/f2', 'm3/f3', 'm4/f4'].map((key) => {
            const [weekId, deckFileId] = key.split('/')
            return { weekId, deckFileId }
        }),
        passedAttempts: passed.map((key) => {
            const [weekId, deckFileId] = key.split('/')
            return { weekId, deckFileId, learnerIds: [null, 'fellow'] }
        }),
        cohortsRequired: 1,
        ...overrides,
    }
}

test('a course certificate is refused at 2 of 3 modules, with the C7 sentence and how far the Fellow is', async () => {
    const refused = await certificateRefusal(
        { teacherId: 'fellow', occasion: 'course', courseId: 'c1' },
        readersFromRows(rows(['m1/f1', 'm2/f2'])),
    )
    assert.deepEqual(refused, {
        error: REFUSALS.COURSE_INCOMPLETE,
        code: 'COURSE_INCOMPLETE',
        doneModules: 2,
        totalModules: 3,
    })
})

test('a course certificate is allowed at 3 of 3 modules', async () => {
    const refused = await certificateRefusal(
        { teacherId: 'fellow', occasion: 'course', courseId: 'c1' },
        readersFromRows(rows(['m1/f1', 'm2/f2', 'm3/f3'])),
    )
    assert.equal(refused, null)
})

test('another Fellow\'s quiz passes do not complete the course', async () => {
    const others = rows([], {
        passedAttempts: ['m1/f1', 'm2/f2', 'm3/f3'].map((key) => {
            const [weekId, deckFileId] = key.split('/')
            return { weekId, deckFileId, learnerIds: ['someone-else'] }
        }),
    })
    const refused = await certificateRefusal({ teacherId: 'fellow', occasion: 'course', courseId: 'c1' }, readersFromRows(others))
    assert.equal(refused?.code, 'COURSE_INCOMPLETE')
})

test('a Fellowship or Advanced certificate is refused until the academy path is done', async () => {
    // c1 complete, c2 (step 2) not: the one cohort is not complete.
    const halfway = await certificateRefusal({ teacherId: 'fellow', occasion: 'graduation' }, readersFromRows(rows(['m1/f1', 'm2/f2', 'm3/f3'])))
    assert.equal(halfway?.code, 'PATH_INCOMPLETE')
    assert.deepEqual(
        { cohortsCompleted: (halfway as any).cohortsCompleted, cohortsRequired: (halfway as any).cohortsRequired },
        { cohortsCompleted: 0, cohortsRequired: 1 },
    )

    const done = await certificateRefusal({ teacherId: 'fellow', occasion: 'graduation' }, readersFromRows(rows(['m1/f1', 'm2/f2', 'm3/f3', 'm4/f4'])))
    assert.equal(done, null)
})

test('the path asks for the number of cohorts the admin saved', async () => {
    const twoNeeded = rows(['m1/f1', 'm2/f2', 'm3/f3', 'm4/f4'], { cohortsRequired: 2 })
    const refused = await certificateRefusal({ teacherId: 'fellow', occasion: 'graduation' }, readersFromRows(twoNeeded))
    assert.equal(refused?.code, 'PATH_INCOMPLETE')
    assert.equal((refused as any).cohortsCompleted, 1)
})

test('a Fellow in no cohort never has the path done', async () => {
    const alone = rows([], { enrolments: [] })
    const refused = await certificateRefusal({ teacherId: 'fellow', occasion: 'graduation' }, readersFromRows(alone))
    assert.equal(refused?.code, 'PATH_INCOMPLETE')
})

test('the admin list says who is ready by the same rules, and leaves inactive Fellows out', async () => {
    const list = await listEligibleFellows(rows(['m1/f1', 'm2/f2']))
    assert.deepEqual(list.map((row) => row.teacherId), ['fellow'])
    const [fellow] = list
    assert.equal(fellow.path.done, false)
    assert.deepEqual(
        fellow.courses.map((row) => [row.courseId, row.doneModules, row.totalModules, row.complete]),
        [['c2', 0, 1, false], ['c1', 2, 3, false]],
    )

    const [finished] = await listEligibleFellows(rows(['m1/f1', 'm2/f2', 'm3/f3', 'm4/f4']))
    assert.equal(finished.path.done, true)
    assert.equal(finished.courses.every((row) => row.complete), true)
})

test('the list counts a lesson file done from its completed progress row, as C3 does', async () => {
    const fromProgress = rows([], {
        progress: ['m1/f1', 'm2/f2', 'm3/f3'].map((key) => {
            const [weekId, deckFileId] = key.split('/')
            return { teacherId: 'fellow', weekId, deckFileId, status: 'available', completedAt: new Date('2026-10-01') }
        }),
    })
    const [fellow] = await listEligibleFellows(fromProgress)
    assert.equal(fellow.courses.find((row) => row.courseId === 'c1')?.complete, true)
})

test('course wording names the course and drops the fellowship topic list (D4b)', () => {
    assert.equal(courseCompletionBody('Lesson Planning'), 'In recognition of successfully completing Lesson Planning. Congratulations!')
    assert.equal(wordingForIssue('fellowship', 'course', 'Lesson Planning').includes('Culture of Achievement'), false)
    assert.equal(wordingForIssue('advanced', 'course', 'Lesson Planning'), courseCompletionBody('Lesson Planning'))
    // Fellowship and Advanced keep their wording: it describes the fellowship itself.
    assert.equal(wordingForIssue('fellowship', 'graduation'), CERTIFICATE_DESIGNS.fellowship.body)
    assert.match(CERTIFICATE_DESIGNS.advanced.body, /Culture of Achievement/)
})

/**
 * The route wiring cannot be driven without the database, so these read `server/routes.ts` as text. They prove the
 * issue route calls the rule before it writes, not that it passes the right ids
 * (docs/_learnings/a-test-that-reads-source-as-text-cannot-guard-a-move.md).
 */
test('the issue route refuses through certificateRefusal before it writes a certificate', () => {
    const routes = read('server/routes.ts')
    const start = routes.indexOf('app.post("/api/admin/certificates/issue"')
    assert.ok(start > 0, 'issue route exists')
    const handler = routes.slice(start, routes.indexOf('\n  });', start))
    const check = handler.indexOf('await certificateRefusal({ teacherId, occasion, courseId })')
    const write = handler.indexOf('storage.issueAcademyCertificate(')
    assert.ok(check > 0, 'the handler calls certificateRefusal')
    assert.ok(write > check, 'the refusal comes before the write')
    assert.match(handler, /if \(refused\) return res\.status\(400\)\.json\(refused\);/)
})

test('the bulk generator that read the stored completion flag is gone, and the rule never reads that flag', () => {
    const routes = read('server/routes.ts')
    assert.equal(routes.includes('/generate-certificates'), false)
    assert.equal(read('server/storage.ts').includes('getCompletedTeachersForBatchCourse'), false)
    assert.equal(/teacherCourseCompletion|teacher_course_completion/.test(read('server/certificateEligibility.ts')), false)
})
