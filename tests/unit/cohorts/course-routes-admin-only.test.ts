import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * D2, widened on 2026-10-29 (plans/academy-desk/academy-desk-round-2-plan.md, decision "Admin and every Trainer"):
 * only admins delete courses; a trainer edits a course they made or one placed on a cohort they run, and makes
 * courses through /api/trainer/courses. Text contracts over `server/routes.ts`: they prove which guard each route
 * names, not that the guard behaves (`trainerMayEditCourse` is driven with rows in
 * tests/unit/contract/trainer-scope.test.ts and tests/unit/academy-desk/trainer-courses-and-uploads.test.ts).
 */

const routes = readFileSync('server/routes.ts', 'utf8')

function route(method: string, path: string) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    return routes.match(new RegExp(`app\\.${method}\\("${escaped}",[\\s\\S]*?\\r?\\n  }\\);\\r?\\n`))?.[0] ?? ''
}

test('course DELETE is admin-only', () => {
    const handler = route('delete', '/api/courses/:id')
    assert.ok(handler, 'delete /api/courses/:id not found')
    assert.match(handler, /^app\.\w+\("[^"]+", isAuthenticated, isAdmin, async/)
    assert.doesNotMatch(handler.split('\n')[0], /isTrainer/)
})

test('course PATCH checks trainerMayEditCourse before it writes', () => {
    const handler = route('patch', '/api/courses/:id')
    assert.ok(handler, 'patch /api/courses/:id not found')
    const guard = handler.indexOf('trainerMayEditCourse(req.user, req.params.id)')
    const write = handler.indexOf('storage.updateCourse(')
    assert.ok(guard > 0, 'course PATCH does not call trainerMayEditCourse')
    assert.ok(write > guard, 'course PATCH writes before its guard')
})

test('the course assign route is gone', () => {
    assert.doesNotMatch(routes, /"\/api\/courses\/:courseId\/assign"/)
})

test('module reorder checks trainerMayEditCourse before it writes', () => {
    const handler = route('post', '/api/courses/:courseId/weeks/reorder')
    assert.ok(handler, 'reorder route not found')
    const guard = handler.indexOf('trainerMayEditCourse(req.user, courseId)')
    const write = handler.indexOf('storage.updateTrainingWeek(')
    assert.ok(guard > 0, 'reorder does not call trainerMayEditCourse')
    assert.ok(write > guard, 'reorder writes before its guard')
    assert.match(handler, /status\(403\)\.json\(refusal\("NOT_YOUR_COURSE"\)\)/)
})
