import assert from 'node:assert/strict'
import test from 'node:test'
import { cohortTabFromSearch, trainerSectionFromSearch, trainerTabRedirect, TRAINER_SECTION_KEYS } from '../../../client/src/components/deskSections.ts'
import {
    apiErrorText,
    canReopen,
    materialBody,
    progressBars,
    reopenBody,
    reopenCandidates,
} from '../../../client/src/components/trainerDeskRules.ts'

/** Pure helpers the Trainer's pages and the Reopen dialog call. Behaviour tests, not text contracts. */

test('the Trainer page draws only the sections whose link points at it', () => {
    assert.deepEqual([...TRAINER_SECTION_KEYS], ['home', 'cohorts', 'assessments', 'progress', 'attendance', 'messages'])
    for (const other of ['courses', 'live-sessions', 'fellows', 'calendar', 'schedule']) {
        assert.equal(trainerSectionFromSearch(`?tab=${other}`), 'home', `?tab=${other} must not name a section the page cannot draw`)
    }
    assert.equal(trainerSectionFromSearch('?tab=progress'), 'progress')
    assert.equal(trainerSectionFromSearch('?tab=desk'), 'home')
    assert.equal(trainerSectionFromSearch(''), 'home')
})

test('?tab=schedule is sent to the Calendar and nothing else is', () => {
    assert.equal(trainerTabRedirect('?tab=schedule'), '/calendar')
    assert.equal(trainerTabRedirect('?tab=progress'), null)
    assert.equal(trainerTabRedirect(''), null)
})

test('the cohort room lands the old Quizzes and Work links on Assessments', () => {
    assert.equal(cohortTabFromSearch('quizzes'), 'assessments')
    assert.equal(cohortTabFromSearch('work'), 'assessments')
    assert.equal(cohortTabFromSearch('assessments'), 'assessments')
    assert.equal(cohortTabFromSearch('performance'), 'performance')
    assert.equal(cohortTabFromSearch(null), 'people')
})

test('reopen sends the deadline as an instant, so the server zone cannot move it', () => {
    const now = new Date('2026-11-06T08:00:00.000Z')
    const result = reopenBody({ kind: 'quiz', itemId: 'q1', scope: 'fellow', teacherId: 't1', dueLocal: '2026-11-20T09:30', now })
    assert.ok('body' in result)
    const due = (result as any).body.dueDate as string
    assert.equal(due, new Date('2026-11-20T09:30').toISOString())
    assert.match(due, /Z$/)
    assert.deepEqual(Object.keys((result as any).body).sort(), ['dueDate', 'itemId', 'kind', 'scope', 'teacherId'])
})

test('reopen for everyone names no Fellow; for one Fellow it needs one; the date must be ahead', () => {
    const now = new Date('2026-11-06T08:00:00.000Z')
    const everyone = reopenBody({ kind: 'assignment', itemId: 'a1', scope: 'everyone', teacherId: 'stale', dueLocal: '2026-12-01T10:00', now })
    assert.ok('body' in everyone)
    assert.equal('teacherId' in (everyone as any).body, false)
    assert.deepEqual(reopenBody({ kind: 'quiz', itemId: 'q', scope: 'fellow', dueLocal: '2026-12-01T10:00', now }), { error: 'Choose the Fellow' })
    assert.deepEqual(reopenBody({ kind: 'quiz', itemId: 'q', scope: 'everyone', dueLocal: '', now }), { error: 'Choose the new deadline' })
    assert.deepEqual(reopenBody({ kind: 'quiz', itemId: 'q', scope: 'everyone', dueLocal: '2026-11-01T10:00', now }), { error: 'The new deadline must be in the future' })
})

test('Reopen is offered only on an item that has a deadline', () => {
    assert.equal(canReopen('2026-11-01T10:00:00.000Z'), true)
    assert.equal(canReopen(null), false)
    assert.equal(canReopen(undefined), false)
    assert.equal(canReopen(''), false)
})

test('the Fellow picker holds those who sit the item, or the whole cohort when it names none', () => {
    const roster = [{ id: 'a', name: 'Amina' }, { id: 'b', name: 'Baraka' }, { id: 'c', email: 'c@x.org' }]
    assert.deepEqual(reopenCandidates([{ teacherId: 'b', name: 'Baraka' }], roster), [{ id: 'b', name: 'Baraka' }])
    assert.deepEqual(reopenCandidates([], roster).map((f) => f.id), ['a', 'b', 'c'])
    assert.equal(reopenCandidates(undefined, roster)[2].name, 'c@x.org')
})

test('the server\'s { error } is the sentence shown', () => {
    assert.equal(apiErrorText(new Error('403: {"error":"That Fellow does not sit this quiz"}'), 'x'), 'That Fellow does not sit this quiz')
    assert.equal(apiErrorText(new Error('500: <html>'), 'Could not reopen'), 'Could not reopen')
    assert.equal(apiErrorText('nope', 'Could not reopen'), 'Could not reopen')
})

test('a material needs a title and a file or a link, and empty teacherIds means the whole cohort', () => {
    const base = { title: ' Week 3 slides ', note: '', fileUrl: null, fileName: null, linkUrl: '', teacherIds: [] as string[] }
    assert.deepEqual(materialBody({ ...base, title: ' ' }), { error: 'Add a title' })
    assert.deepEqual(materialBody(base), { error: 'Add a file or a link' })
    assert.deepEqual(materialBody({ ...base, linkUrl: ' https://example.org/a ' }), { body: { title: 'Week 3 slides', linkUrl: 'https://example.org/a', teacherIds: [] } })
    const withFile = materialBody({ ...base, note: 'Read first', fileUrl: 'https://x.public.blob.vercel-storage.com/a.pdf', fileName: 'a.pdf', teacherIds: ['t1'] })
    assert.deepEqual(withFile, { body: { title: 'Week 3 slides', note: 'Read first', fileUrl: 'https://x.public.blob.vercel-storage.com/a.pdf', fileName: 'a.pdf', teacherIds: ['t1'] } })
})

test('the progress chart has one bar per Fellow, lowest first, held to 0-100', () => {
    const bars = progressBars([
        { teacherName: 'Zed', overallPercentage: 140 },
        { teacher: { name: 'Amina' }, overallPercentage: 40 },
        { teacherName: 'Baraka', overallPercentage: 40.4 },
        { teacherName: 'Nobody' },
    ])
    assert.deepEqual(bars, [
        { name: 'Nobody', percent: 0 },
        { name: 'Amina', percent: 40 },
        { name: 'Baraka', percent: 40 },
        { name: 'Zed', percent: 100 },
    ])
})
