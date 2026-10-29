import assert from 'node:assert/strict'
import test from 'node:test'
import {
    DESK_MENUS,
    DESK_NAV_TOUR,
    DESK_PHONE_BAR,
    deskItemForLocation,
    deskItemHook,
} from '../../../client/src/components/deskMenu.ts'

/** The shell's menus (design/board/Shell.dc.html): which item a location makes current, and the hooks each item carries. */

test('each desk lists the board\'s items in order', () => {
    const labels = (desk: keyof typeof DESK_MENUS) => DESK_MENUS[desk].map((item) => item.label)
    assert.deepEqual(labels('admin'), ['Home', 'Approvals', 'People', 'Cohorts', 'Calendar', 'Attendance', 'Analytics', 'Certificates'])
    assert.deepEqual(labels('trainer'), ['Home', 'Cohorts', 'Fellows', 'Courses', 'Assessments', 'Progress', 'Attendance', 'Messages', 'Schedule', 'Calendar'])
    assert.deepEqual(labels('fellow'), ['Home', 'Learning', 'Work', 'Quizzes', 'Progress', 'Reflect', 'Messages', 'Calendar', 'Certificates'])
})

test('/admin opens Home, and each admin page names its own item', () => {
    assert.equal(deskItemForLocation('admin', '/admin'), 'home')
    assert.equal(deskItemForLocation('admin', '/approvals'), 'approvals')
    assert.equal(deskItemForLocation('admin', '/admin/people'), 'people')
    assert.equal(deskItemForLocation('admin', '/admin/batches'), 'cohorts')
    assert.equal(deskItemForLocation('admin', '/admin/certificates'), 'certificates')
})

test('a person\'s or a cohort\'s own pages keep their menu item current', () => {
    assert.equal(deskItemForLocation('admin', '/admin/trainers/42'), 'people')
    assert.equal(deskItemForLocation('admin', '/admin/teachers/7'), 'people')
    assert.equal(deskItemForLocation('admin', '/cohorts/abc'), 'cohorts')
    assert.equal(deskItemForLocation('admin', '/courses/12/weeks/3'), 'cohorts')
    assert.equal(deskItemForLocation('trainer', '/cohorts/abc'), 'cohorts')
    assert.equal(deskItemForLocation('fellow', '/teacher/week/9/content'), 'learning')
    assert.equal(deskItemForLocation('fellow', '/teacher/exams/5'), 'quizzes')
    assert.equal(deskItemForLocation('fellow', '/teacher/certificates/1'), 'certificates')
})

test('Trainer and Fellow sections follow ?tab=, and a desk page with no tab opens on Home', () => {
    assert.equal(deskItemForLocation('trainer', '/trainer/batches', 'tab=messages'), 'messages')
    assert.equal(deskItemForLocation('trainer', '/trainer/batches', '?tab=schedule'), 'schedule')
    assert.equal(deskItemForLocation('trainer', '/trainer/batches', ''), 'home')
    assert.equal(deskItemForLocation('fellow', '/teacher/dashboard', 'tab=reflect'), 'reflect')
    assert.equal(deskItemForLocation('fellow', '/teacher/dashboard'), 'home')
    assert.equal(deskItemForLocation('fellow', '/teacher/dashboard', 'tab=unknown'), 'home')
})

test('the shared Calendar and the Trainer\'s Fellows page keep their own menu items current', () => {
    assert.equal(deskItemForLocation('admin', '/calendar'), 'calendar')
    assert.equal(deskItemForLocation('trainer', '/calendar'), 'calendar')
    assert.equal(deskItemForLocation('fellow', '/calendar'), 'calendar')
    assert.equal(deskItemForLocation('trainer', '/trainer/fellows'), 'fellows')
    assert.equal(deskItemForLocation('trainer', '/trainer/courses'), 'courses')
})

test('a page outside the desk makes no item current', () => {
    assert.equal(deskItemForLocation('fellow', '/admin'), undefined)
    assert.equal(deskItemForLocation('trainer', '/teacher/dashboard'), undefined)
})

test('Admin items keep the admin-nav-* hooks the tour and tests use; other desks use nav-<desk>-*', () => {
    const admin = DESK_MENUS.admin.map((item) => deskItemHook('admin', item))
    for (const hook of ['admin-nav-desk', 'admin-nav-approvals', 'admin-nav-people', 'admin-nav-cohorts', 'admin-nav-attendance', 'admin-nav-analytics']) {
        assert.ok(admin.includes(hook), hook)
    }
    assert.equal(deskItemHook('trainer', DESK_MENUS.trainer[0]), 'nav-trainer-home')
    assert.equal(deskItemHook('fellow', DESK_MENUS.fellow[1]), 'nav-fellow-learning')
    assert.equal(DESK_NAV_TOUR.admin, 'admin-nav')
    assert.equal(DESK_NAV_TOUR.trainer, 'trainer-tools')
    assert.equal(DESK_MENUS.fellow.find((item) => item.key === 'certificates')?.tour, 'teacher-certificates')
})

test('each phone bar holds four of its desk\'s items, the rest go under More', () => {
    assert.deepEqual(DESK_PHONE_BAR.fellow, ['home', 'learning', 'work', 'messages'])
    for (const desk of ['admin', 'trainer', 'fellow'] as const) {
        const keys = DESK_MENUS[desk].map((item) => item.key)
        assert.equal(DESK_PHONE_BAR[desk].length, 4, desk)
        for (const key of DESK_PHONE_BAR[desk]) assert.ok(keys.includes(key), `${desk}: ${key}`)
    }
})
