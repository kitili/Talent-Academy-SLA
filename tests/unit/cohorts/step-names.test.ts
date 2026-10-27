import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ACADEMY_TERMS, nextBatchName } from '../../../shared/academyPath.ts'

/** D1 (C6) on the admin side: a new step is named "Step One", and the Cohorts page labels each step "Step n". */

test('a new step is named Step One, then Step Two', () => {
    assert.equal(nextBatchName(0), 'Step One')
    assert.equal(nextBatchName(1), 'Step Two')
})

test('the admin Cohorts page labels steps with the C6 term, not Week or Batch (text contract)', () => {
    // Reads the page as text: it proves the words the page writes, not what a browser draws.
    const page = readFileSync('client/src/pages/admin-batches.tsx', 'utf8')
    assert.equal(ACADEMY_TERMS.step.title, 'Step')
    assert.match(page, />\{ACADEMY_TERMS\.step\.title\} \{index \+ 1\}</)
    assert.match(page, /card-term-\$\{key\}/)
    assert.match(page, /ACADEMY_TERMS\[key\]\.title/)
    assert.doesNotMatch(page, />Week \{index \+ 1\}</)
    assert.doesNotMatch(page, /ACADEMY_TERMS\.batch|\["batch", "border-t-/)
    assert.doesNotMatch(page, /Batch (added|updated|removed)|Edit batch|in this batch|Batch One|batches, and courses/)
})
