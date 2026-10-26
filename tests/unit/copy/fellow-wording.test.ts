import assert from 'node:assert/strict'
import test from 'node:test'
import { ACADEMY_TERMS } from '../../../shared/academyPath.ts'
import { MODULE_QUIZ_PASS_PERCENT } from '../../../shared/constants.ts'
import { ADMIN_TOUR, TEACHER_TOUR, TRAINER_TOUR } from '../../../shared/guidedTour.ts'

/** D13 and D1: the tours the apps play say Fellow, cohort and step, and quote the pass mark from constants. */

const tourText = (steps: Array<{ title: string; body: string }>) =>
    steps.map((step) => `${step.title} ${step.body}`).join(' ')

test('no tour calls the learner a teacher or a step a batch', () => {
    for (const [name, steps] of [['admin', ADMIN_TOUR], ['trainer', TRAINER_TOUR], ['fellow', TEACHER_TOUR]] as const) {
        const text = tourText(steps)
        assert.equal(/\bteachers?\b/i.test(text), false, `${name} tour says teacher`)
        assert.equal(/\bbatch(es)?\b/i.test(text), false, `${name} tour says batch`)
    }
})

test('the Fellow tour uses the academy term and the module pass mark', () => {
    const text = tourText(TEACHER_TOUR)
    assert.ok(text.includes(ACADEMY_TERMS.learner.title))
    assert.ok(text.includes(`${MODULE_QUIZ_PASS_PERCENT}%`))
})
