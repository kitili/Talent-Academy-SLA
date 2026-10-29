import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { enrolmentsToAdd } from '../../../server/cohortRoster.ts'

/** D9: an admin's step save adds missing cohort enrolments and never removes any (finding 5). */

function enrolmentAfterSave(rows: { stepBefore: string[]; stepAfter: string[]; enrolled: string[] }) {
    return [...rows.enrolled, ...enrolmentsToAdd(rows)].sort()
}

test('a Fellow a trainer added to the cohort survives a step save that does not hold them', () => {
    // f-trainer was added on the roster (POST /api/batches/:batchId/teachers) and is on no step.
    const after = enrolmentAfterSave({ stepBefore: ['f1'], stepAfter: ['f1', 'f2'], enrolled: ['f1', 'f-trainer'] })
    assert.deepEqual(after, ['f-trainer', 'f1', 'f2'])
})

test('unticking a Fellow on a step keeps them in the cohort', () => {
    const after = enrolmentAfterSave({ stepBefore: ['f1', 'f2'], stepAfter: ['f1'], enrolled: ['f1', 'f2'] })
    assert.deepEqual(after, ['f1', 'f2'])
})

test('a newly ticked Fellow is enrolled once, and an enrolled one is not added again', () => {
    assert.deepEqual(enrolmentsToAdd({ stepBefore: [], stepAfter: ['f2', 'f2', 'f1'], enrolled: ['f1'] }), ['f2'])
})

test('a save never re-enrols a Fellow removed on the roster who was already on the step', () => {
    // f1 stays ticked on the step, but the trainer removed them from the cohort: the Remove wins.
    assert.deepEqual(enrolmentsToAdd({ stepBefore: ['f1'], stepAfter: ['f1', 'f3'], enrolled: [] }), ['f3'])
})

test('the step teacher save deletes no enrolment and adds through enrolmentsToAdd (text contract)', () => {
    // Reads source as text: it proves what the handler says today, not how it behaves against a database.
    const source = readFileSync('server/academyPathRoutes.ts', 'utf8')
    const handler = source.match(
        /app\.put\("\/api\/admin\/academy-path\/batches\/:batchId\/teachers"[\s\S]*?\r?\n  }\);\r?\n/,
    )?.[0] ?? ''
    assert.ok(handler, 'step teacher save not found')
    assert.doesNotMatch(handler, /db\.delete\(batchTeachers\)/)
    assert.doesNotMatch(handler, /removeTeacherFromBatch/)
    assert.match(handler, /enrolmentsToAdd\(/)
    assert.match(handler, /db\.insert\(batchTeachers\)/)
})

test('the cohort roster dialog says unticking takes a Fellow out of the cohort and keeps their progress', () => {
    // The per-step ticks moved behind "Split into parts"; the roster the Admin edits is the cohort's own, so
    // the Remove is the untick there. A step save (above) still never removes an enrolment.
    const page = readFileSync('client/src/pages/admin-batches.tsx', 'utf8')
    assert.match(page, /untick to take them out/)
    assert.match(page, /Their progress is kept/)
    assert.match(page, /check-roster-/)
})
