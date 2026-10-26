import assert from 'node:assert/strict'
import test from 'node:test'
import { completionRowFor, mergeCourseCompletion } from '../../../server/learnerPath.ts'
import { method, source } from './pathRows.ts'

/**
 * N5: the completion sync computes with C3, completes only at 100%, and never writes `in_progress`
 * over `completed`. `upsertTeacherCourseCompletion` writes `mergeCourseCompletion(existing, incoming)`.
 */

const now = new Date('2026-10-27T10:00:00Z')
const earlier = new Date('2026-09-01T08:00:00Z')

test('the sync writes completed only when every module is complete', () => {
    assert.equal(completionRowFor({ totalModules: 10, doneModules: 9, complete: false }, now).status, 'in_progress', '90% used to complete')
    assert.equal(completionRowFor({ totalModules: 10, doneModules: 9, complete: false }, now).completedAt, null)
    const done = completionRowFor({ totalModules: 3, doneModules: 3, complete: true }, now)
    assert.deepEqual(done, { status: 'completed', completedAt: now, totalWeeks: 3, completedWeeks: 3 })
})

test('a completed row stays completed, with its first completion time, when the next sync says in progress', () => {
    const existing = { status: 'completed', completedAt: earlier, totalWeeks: 3, completedWeeks: 3 }
    const incoming = completionRowFor({ totalModules: 4, doneModules: 3, complete: false }, now)
    const merged = mergeCourseCompletion(existing, incoming)
    assert.equal(merged.status, 'completed')
    assert.equal(merged.completedAt, earlier)
    assert.equal(merged.totalWeeks, 4, 'the counts follow the latest computation')
    assert.equal(merged.completedWeeks, 3)
})

test('a completed row keeps its first completion time when completed again', () => {
    const merged = mergeCourseCompletion({ status: 'completed', completedAt: earlier }, { status: 'completed', completedAt: now })
    assert.equal(merged.completedAt, earlier)
})

test('an in-progress row moves to completed, and a new row starts in progress', () => {
    const merged = mergeCourseCompletion({ status: 'in_progress', completedAt: null }, { status: 'completed', completedAt: now })
    assert.equal(merged.status, 'completed')
    assert.equal(merged.completedAt, now)
    assert.equal(mergeCourseCompletion(undefined, completionRowFor({ totalModules: 2, doneModules: 0, complete: false }, now)).status, 'in_progress')
})

// Text contracts: prove the storage methods call the rules; they cannot catch a wrong argument.
test('the sync and the upsert in storage use C3 and the merge', () => {
    const storage = source('server/storage.ts')
    const sync = method(storage, 'async syncTeacherCourseCompletion(')
    assert.match(sync, /const write = completionRowFor\(await computeCourseCompletion\(teacherId, courseId\), new Date\(\)\);/)
    assert.doesNotMatch(sync, /90/)
    const upsert = method(storage, 'async upsertTeacherCourseCompletion(')
    assert.match(upsert, /const existing = await this\.getTeacherCourseCompletion\(completion\.teacherId, completion\.courseId, completion\.batchId\);\r?\n\s*const merged = mergeCourseCompletion\(existing, completion\);/)
    assert.match(upsert, /set: row,/)
})
