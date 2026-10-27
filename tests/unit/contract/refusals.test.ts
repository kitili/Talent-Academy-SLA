import assert from 'node:assert/strict'
import test from 'node:test'
import { REFUSALS, refusal } from '../../../shared/constants.ts'

/** C7: the new refusals, sent as { error, code }, each with the sentence the user sees. */

test('every refusal code the plan names exists, with a sentence', () => {
    assert.deepEqual(Object.keys(REFUSALS).sort(), [
        'ADMIN_ONLY',
        'COURSE_INCOMPLETE',
        'MODULE_LOCKED',
        'NOT_ENROLLED',
        'NOT_YOUR_COURSE',
        'QUIZ_NOT_APPROVED',
    ])
    for (const sentence of Object.values(REFUSALS)) assert.match(sentence, /^[A-Z].+\.$/)
})

test('refusal builds the body a route sends', () => {
    assert.deepEqual(refusal('COURSE_INCOMPLETE'), { error: REFUSALS.COURSE_INCOMPLETE, code: 'COURSE_INCOMPLETE' })
})
