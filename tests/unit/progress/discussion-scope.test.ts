import assert from 'node:assert/strict'
import test from 'node:test'
import { discussionAccess, trainerMaySeeTeacherModule, visibleDiscussionPosts, type DiscussionReaders } from '../../../server/learnerPath.ts'
import { handler, source } from './pathRows.ts'

/**
 * D11: a module discussion is read and posted only by Fellows in an open cohort that holds the module's
 * course, and by staff in scope; a Fellow sees the posts of Fellows in their own cohorts. The trainer
 * content history is scoped the same way.
 */

const readers: DiscussionReaders = {
    cohortIdsHoldingCourse: async (courseId) => (courseId === 'course' ? ['cohort-a', 'cohort-b'] : []),
    teacherCohortsForCourse: async (teacherId, courseId) =>
        courseId !== 'course' ? [] : teacherId === 'fellow-a' ? [{ id: 'cohort-a' }] : teacherId === 'fellow-b' ? [{ id: 'cohort-b' }] : [],
    trainerCohortIds: async (trainerId) => (trainerId === 'trainer-a' ? ['cohort-a'] : trainerId === 'trainer-c' ? ['cohort-c'] : []),
    teacherIdsInCohort: async (cohortId) => (cohortId === 'cohort-a' ? ['fellow-a'] : cohortId === 'cohort-b' ? ['fellow-b'] : []),
}

const posts = [
    { id: '1', authorId: 'fellow-a', authorRole: 'teacher' },
    { id: '2', authorId: 'fellow-b', authorRole: 'teacher' },
    { id: '3', authorId: 'trainer-a', authorRole: 'trainer' },
]

test('a Fellow outside every open cohort that holds the course is refused', async () => {
    const access = await discussionAccess({ teacherId: 'stranger' }, 'course', readers)
    assert.equal(!access.ok && access.refusal.body.code, 'NOT_ENROLLED')
})

test('a Fellow sees posts from Fellows in their cohort, and staff posts', async () => {
    const access = await discussionAccess({ teacherId: 'fellow-a' }, 'course', readers)
    assert.equal(access.ok, true)
    const seen = visibleDiscussionPosts(posts, access.ok ? access.authors : new Set())
    assert.deepEqual(seen.map((post) => post.id), ['1', '3'])
})

test('a trainer is refused a module whose course is on no cohort they run; an admin sees every post', async () => {
    const refused = await discussionAccess({ user: { id: 'trainer-c', role: 'trainer' } }, 'course', readers)
    assert.equal(!refused.ok && refused.refusal.body.code, 'NOT_YOUR_COURSE')
    const admin = await discussionAccess({ user: { id: 'admin', role: 'admin' } }, 'course', readers)
    assert.equal(admin.ok && admin.authors, null)
    assert.equal(visibleDiscussionPosts(posts, null).length, 3)
})

test('content history: a trainer sees a Fellow only through a cohort that enrolls them and holds the course', async () => {
    assert.equal(await trainerMaySeeTeacherModule({ id: 'trainer-a', role: 'trainer' }, 'fellow-a', 'course', readers), true)
    assert.equal(await trainerMaySeeTeacherModule({ id: 'trainer-a', role: 'trainer' }, 'fellow-b', 'course', readers), false)
    assert.equal(await trainerMaySeeTeacherModule({ id: 'trainer-c', role: 'trainer' }, 'fellow-a', 'course', readers), false)
    assert.equal(await trainerMaySeeTeacherModule({ id: 'admin', role: 'admin' }, 'fellow-b', 'course', readers), true)
})

// Text contracts: prove the routes call the gates; they cannot catch a wrong id passed in.
test('both discussion routes and the content history call their gates', () => {
    const routes = source('server/routes.ts')
    for (const start of ['app.get("/api/weeks/:weekId/discussions"', 'app.post("/api/weeks/:weekId/discussions"']) {
        assert.match(handler(routes, start), /const access = await discussionAccess\(\{ teacherId: req\.teacherId, user: req\.user \}, week\.courseId\);\r?\n\s*if \(!access\.ok\) return res\.status/, start)
    }
    assert.match(handler(routes, 'app.get("/api/weeks/:weekId/discussions"'), /visibleDiscussionPosts\(await storage\.listDiscussionPosts\(req\.params\.weekId\), access\.authors\)/)
    assert.match(handler(routes, 'app.get("/api/trainers/teachers/:teacherId/weeks/:weekId/content-history"'), /if \(!await trainerMaySeeTeacherModule\(req\.user, teacherId, week\.courseId\)\) \{/)
})

test('the discussion copy says who reads it (D11)', () => {
    const thread = source('client/src/components/DiscussionThread.tsx')
    assert.match(thread, /Other Fellows in your cohort can read this\. Your trainer does not see this thread; use\{" "\}\r?\n\s*<Link href="\/teacher\/dashboard\?tab=messages"[^>]*>Messages<\/Link> for a reply\./)
    assert.doesNotMatch(thread, /Your trainer can reply here/)
})

test('the desk peers come from the cohort trainers, not created_by (C4)', () => {
    const peers = handler(source('server/routes.ts'), 'app.get("/api/teacher/desk-peers"')
    assert.doesNotMatch(peers, /createdBy/)
    assert.match(peers, /for \(const trainerId of \[batch\?\.trainerId, \.\.\.\(batch\?\.trainerIds \|\| \[\]\)\]\) \{/)
})
