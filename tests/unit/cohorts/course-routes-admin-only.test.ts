import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * D2: only admins create, edit, delete and place courses; a trainer reorders the modules of a course placed
 * on a cohort they run. Text contracts over `server/routes.ts`: they prove which guard each route names, not
 * that the guard behaves (`trainerMayEditCourse` is driven with rows in tests/unit/contract/trainer-scope.test.ts).
 */

const routes = readFileSync('server/routes.ts', 'utf8')

function route(method: string, path: string) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    return routes.match(new RegExp(`app\\.${method}\\("${escaped}",[\\s\\S]*?\\r?\\n  }\\);\\r?\\n`))?.[0] ?? ''
}

test('course PATCH and DELETE are admin-only', () => {
    for (const method of ['patch', 'delete']) {
        const handler = route(method, '/api/courses/:id')
        assert.ok(handler, `${method} /api/courses/:id not found`)
        assert.match(handler, /^app\.\w+\("[^"]+", isAuthenticated, isAdmin, async/)
        assert.doesNotMatch(handler.split('\n')[0], /isTrainer/)
    }
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
