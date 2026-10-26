import assert from 'node:assert/strict'
import test from 'node:test'
import { computeCourseCompletion } from '../../../server/completion.ts'
import { lessonFileDone, lessonFileStates, markReadProgress, mergeContentProgress } from '../../../server/learnerPath.ts'
import { handler, readersFor, source, type PathFacts } from './pathRows.ts'

/** D6: a lesson file with no approved quiz is done once the Fellow marks it read. */

const now = new Date('2026-10-27T10:00:00Z')

test('marking a file with no approved quiz read makes it done', () => {
    const row = { deckFileId: 'f1', ...markReadProgress(false, now) }
    assert.equal(row.status, 'completed')
    assert.equal(lessonFileDone(row, false, false), true)
})

test('marking a file with an approved quiz read does not make it done', () => {
    const row = { deckFileId: 'f1', ...markReadProgress(true, now) }
    assert.equal(row.status, 'viewed')
    assert.equal(lessonFileDone(row, true, false), false)
    assert.equal(lessonFileDone(row, true, true), true, 'passing the quiz does')
})

test('a file marked read before a quiz was approved stays done (D6)', () => {
    const row = { deckFileId: 'f1', ...markReadProgress(false, now) }
    assert.equal(lessonFileDone(row, true, false), true)
})

const facts = (progress: PathFacts['progress']): PathFacts => ({
    courses: [{ id: 'c1', name: 'Course 1' }],
    placements: [{ courseId: 'c1', assignedAt: '2026-01-01T00:00:00Z' }],
    modules: { c1: [{ id: 'm1', weekNumber: 1, deckFiles: [{ id: 'f1' }, { id: 'f2' }] }] },
    approved: [],
    progress,
})

test('the next file opens once the file before it is marked read, and C3 agrees on the course', async () => {
    const before = readersFor(facts({}))
    const states = await lessonFileStates('t1', { id: 'm1', deckFiles: [{ id: 'f1' }, { id: 'f2' }] }, before)
    assert.deepEqual(states.map((state) => [state.done, state.locked]), [[false, false], [false, true]])

    const read = (fileId: string) => ({ deckFileId: fileId, ...markReadProgress(false, now) })
    const after = readersFor(facts({ m1: [read('f1')] }))
    const opened = await lessonFileStates('t1', { id: 'm1', deckFiles: [{ id: 'f1' }, { id: 'f2' }] }, after)
    assert.deepEqual(opened.map((state) => [state.done, state.locked]), [[true, false], [false, false]])
    assert.equal((await computeCourseCompletion('t1', 'c1', after)).complete, false)

    const both = readersFor(facts({ m1: [read('f1'), read('f2')] }))
    assert.equal((await computeCourseCompletion('t1', 'c1', both)).complete, true)
})

test('a later "available" write for the next file does not undo a read', () => {
    const read = mergeContentProgress(undefined, markReadProgress(false, now))
    const after = mergeContentProgress(read, { status: 'available' })
    assert.equal(after.status, 'completed')
    assert.equal(after.completedAt, now)
})

// Text contract: proves the route writes the mark-read rule and syncs; it cannot catch a wrong id.
test('mark read writes markReadProgress for the file and runs the completion sync', () => {
    const viewed = handler(source('server/routes.ts'), 'app.post("/api/teachers/weeks/:weekId/content/:deckFileId/viewed"')
    assert.match(viewed, /\.\.\.markReadProgress\(file\.hasApprovedQuiz, new Date\(\)\),/)
    assert.match(viewed, /await storage\.syncTeacherCourseCompletion\(teacherId, week\.courseId\);/)
    assert.match(viewed, /if \(!file \|\| file\.locked\) \{/)
})

test('the content view offers "Mark read to continue" on files with no approved quiz', () => {
    const page = source('client/src/pages/teacher-content-view.tsx')
    assert.match(page, /Mark read to continue/)
    assert.equal((page.match(/<MarkReadButton\r?\n/g) || []).length, 2, 'mobile and desktop lists')
    assert.match(page, /const isLocked = file\.status === "locked";/)
})
