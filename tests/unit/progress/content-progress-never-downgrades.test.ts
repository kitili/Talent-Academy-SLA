import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeContentProgress } from '../../../server/learnerPath.ts'
import { method, source } from './pathRows.ts'

/**
 * Track 0's hand-over: the quiz-pass path writes the next file `available`, which used to turn its
 * `completed` or `viewed` row back. `upsertTeacherContentProgress` now writes the pure merge.
 */

const viewedAt = new Date('2026-10-01T09:00:00Z')
const completedAt = new Date('2026-10-02T09:00:00Z')

test('available never overwrites completed or viewed', () => {
    assert.equal(mergeContentProgress({ status: 'completed', completedAt }, { status: 'available' }).status, 'completed')
    assert.equal(mergeContentProgress({ status: 'viewed', viewedAt }, { status: 'available' }).status, 'viewed')
    assert.equal(mergeContentProgress({ status: 'completed' }, { status: 'viewed', viewedAt }).status, 'completed')
})

test('a status moves forward', () => {
    assert.equal(mergeContentProgress({ status: 'available' }, { status: 'viewed' }).status, 'viewed')
    assert.equal(mergeContentProgress({ status: 'viewed' }, { status: 'completed' }).status, 'completed')
    assert.equal(mergeContentProgress(undefined, { status: 'available' }).status, 'available')
    assert.equal(mergeContentProgress(undefined, {}).status, 'locked')
})

test('the first viewed and completed times survive every later write', () => {
    const later = new Date('2026-10-20T09:00:00Z')
    const merged = mergeContentProgress({ status: 'completed', viewedAt, completedAt }, { status: 'available', viewedAt: later, completedAt: null })
    assert.equal(merged.viewedAt, viewedAt)
    assert.equal(merged.completedAt, completedAt)
})

// Text contract: proves storage writes the merge; it cannot catch a wrong row read first.
test('upsertTeacherContentProgress writes the merged row on insert and on conflict', () => {
    const upsert = method(source('server/storage.ts'), 'async upsertTeacherContentProgress(')
    assert.match(upsert, /const existing = await this\.getTeacherContentProgress\(progress\.teacherId, progress\.weekId, progress\.deckFileId\);\r?\n\s*const merged = mergeContentProgress\(existing, progress\);/)
    assert.match(upsert, /set: row,/)
    assert.doesNotMatch(upsert, /progress\.status !== undefined/)
})
