import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Text contracts for Track B's route wiring. The handlers call `storage` and `db`, so they cannot be
 * driven here; these read the source and prove only that each route calls the tested rule today. A
 * route that calls the right function with a wrong id would still pass, and a moved route fails
 * (docs/_learnings/a-test-that-reads-source-as-text-cannot-guard-a-move.md).
 */

const routes = readFileSync('server/routes.ts', 'utf8')
const storage = readFileSync('server/storage.ts', 'utf8')
const gate = readFileSync('server/cohortGate.ts', 'utf8')

/** The source of one route handler, from its registration to the next one. */
function handler(registration: string) {
    const start = routes.indexOf(registration)
    assert.ok(start >= 0, `route not found: ${registration}`)
    const next = routes.indexOf('\n  app.', start + registration.length)
    return routes.slice(start, next < 0 ? undefined : next)
}

/** The body of one storage method, from its signature to the next method. */
function method(signature: string) {
    const start = storage.indexOf(signature)
    assert.ok(start >= 0, `method not found: ${signature}`)
    const next = storage.slice(start + signature.length).search(/\r?\n  (async |\/\*\*)/)
    return storage.slice(start, next < 0 ? undefined : start + signature.length + next)
}

test('every cached-quiz save is a draft: storage writes approved false whatever the caller passes (D5)', () => {
    const save = method('async saveCachedQuiz(cache: InsertQuizCache)')
    assert.match(save, /\.values\(\{ \.\.\.cache, approved: false, approvedAt: null \}/)
    // The one writer of approved = true is the approve method a person calls.
    const writers = storage.match(/approved: true/g) ?? []
    assert.equal(writers.length, 1)
    assert.match(method('async approveCachedQuiz(weekId: string, fileId: string)'), /\.set\(\{ approved: true, approvedAt: new Date\(\) \}\)/)
})

test('no route asks for an approved AI draft: deck upload, generate, regenerate and the bulk job', () => {
    const saves = routes.match(/saveCachedQuiz\(\{[\s\S]*?\}\)/g) ?? []
    assert.ok(saves.length >= 5, `expected five saveCachedQuiz calls, found ${saves.length}`)
    for (const save of saves) assert.doesNotMatch(save, /approved: true/)
})

const scoped: Array<[string, RegExp]> = [
    ['app.post("/api/training-weeks", isAuthenticated, isTrainer', /blockCourseEdit\(res, req\.user, validated\.courseId\)/],
    ['app.patch("/api/training-weeks/:id", isAuthenticated, isTrainer', /editableModule\(res, req\.user, req\.params\.id\)[\s\S]*blockCourseEdit\(res, req\.user, validated\.courseId\)/],
    ['app.delete("/api/training-weeks/:id", isAuthenticated, isTrainer', /editableModule\(res, req\.user, req\.params\.id\)/],
    ['app.post("/api/training-weeks/reorder", isAuthenticated, isTrainer', /blockCourseEdit\(res, req\.user, courseId\)/],
    ['app.post("/api/training-weeks/:id/import-package"', /editableModule\(res, req\.user, req\.params\.id\)/],
    ['app.post("/api/training-weeks/:id/external-link"', /editableModule\(res, req\.user, req\.params\.id\)/],
    ['app.post("/api/training-weeks/:id/deck", isAuthenticated, isTrainer', /editableModule\(res, req\.user, req\.params\.id\)/],
    ['app.delete("/api/training-weeks/:id/deck/:fileId"', /editableModule\(res, req\.user, id\)/],
    ['app.post("/api/training-weeks/:id/deck/reorder"', /editableModule\(res, req\.user, id\)/],
    ['app.post("/api/training-weeks/:weekId/content", isAuthenticated, isTrainer', /editableModule\(res, req\.user, req\.params\.weekId\)/],
    ['app.patch("/api/content-items/:id"', /editableContentItem\(req, res\)[\s\S]*editableModule\(res, req\.user, String\(req\.body\.weekId\)\)/],
    ['app.delete("/api/content-items/:id"', /editableContentItem\(req, res\)/],
    ['app.post("/api/training-weeks/:weekId/files/:fileId/generate-quiz", isAuthenticated, isTrainer', /editableModule\(res, req\.user, weekId\)/],
    ['app.patch("/api/training-weeks/:weekId/files/:fileId/quiz", isAuthenticated, isTrainer', /editableModule\(res, req\.user, weekId\)/],
    ['app.post("/api/training-weeks/:weekId/files/:fileId/quiz/approve", isAuthenticated, isTrainer', /editableModule\(res, req\.user, weekId\)/],
    ['app.post("/api/training-weeks/:weekId/files/:fileId/regenerate-quiz-admin", isAuthenticated, isTrainer', /editableModule\(res, req\.user, weekId\)/],
]

test('module, lesson-file, content-item and quiz writes check the course is the caller\'s (D2, D5)', () => {
    for (const [registration, check] of scoped) {
        const body = handler(registration)
        assert.match(body, check, `${registration} does not check the course scope`)
        // The check comes before the write it guards.
        const at = body.search(check)
        const write = body.search(/storage\.(create|update|delete|save|approve)[A-Za-z]*\(|generateSingleFileQuiz\(/)
        if (write >= 0) assert.ok(at < write, `${registration} writes before it checks`)
    }
})

test('the scope helpers ask C5 and refuse with NOT_YOUR_COURSE', () => {
    assert.match(gate, /export async function editableModule\([\s\S]*?trainerMayEditCourse\(user, week\.courseId\)[\s\S]*?refusal\("NOT_YOUR_COURSE"\)/)
    assert.match(gate, /export async function blockCourseEdit\([\s\S]*?trainerMayEditCourse\(user, courseId\)[\s\S]*?refusal\("NOT_YOUR_COURSE"\)/)
    // A module on no course is the admin's alone.
    assert.match(gate, /: user\?\.role === "admin";/)
})

test('module-quiz submit gates the teacher before it saves an attempt (C3, C5)', () => {
    const body = handler('app.post("/api/training-weeks/:weekId/files/:fileId/submit-quiz"')
    const gateAt = body.indexOf('if (await blockTeacherWeekQuiz(res, teacherId, week)) return;')
    assert.ok(gateAt > 0, 'submit does not gate the teacher on the module')
    assert.ok(gateAt < body.indexOf('storage.saveQuizAttempt('), 'submit saves before it gates')
    assert.match(gate, /export async function blockTeacherWeekQuiz\([\s\S]*?await lessonQuizGate\(teacherId, week\)[\s\S]*?res\.status\(403\)\.json\(refused\)/)
})

test('the module quiz read goes through the learner projection, and file-quizzes counts approved quizzes only', () => {
    assert.match(handler('app.get("/api/training-weeks/:weekId/files/:fileId/quiz"'), /const view = lessonQuizForViewer\(cachedQuiz, isAdminOrTrainer\);/)
    assert.match(handler('app.get("/api/teacher/week/:weekId/file-quizzes"'), /const quizExists = isLiveLessonQuiz\(cached\);/)
})

test('assigned-quiz reads and submit use the quiz\'s pass mark and QUIZ_ATTEMPTS, not fixed numbers', () => {
    const region = routes.slice(routes.indexOf('app.get("/api/teacher/quizzes"'), routes.indexOf('app.get("/api/batches/:batchId/progress"'))
    assert.doesNotMatch(region, />= 80\b/)
    assert.doesNotMatch(region, /(>=|<) 3\b|3 - attempt/)
    assert.match(handler('app.post("/api/assigned-quizzes/:quizId/submit"'), /assignedQuizStanding\(existingAttempts, passMark\)/)
    assert.match(handler('app.get("/api/assigned-quizzes/:quizId/attempts"'), /assignedQuizStanding\(attempts, passMarkOf\(quiz\?\.passMark\)\)[\s\S]*quiz: quiz \? attemptQuizView\(quiz, standing\) : quiz/)
    assert.match(handler('app.get("/api/teacher/quiz-attempts"'), /quiz: quiz \? attemptQuizView\(quiz, standing\) : null/)
})

test('the quiz dialog states the module pass mark from C1, and CourseWeeks mounts the approve dialog for trainers', () => {
    const dialog = readFileSync('client/src/components/FileQuizDialog.tsx', 'utf8')
    assert.doesNotMatch(dialog, /\d+% required|pass at \d+%/)
    assert.equal((dialog.match(/pass at \$?\{MODULE_QUIZ_PASS_PERCENT\}%/g) ?? []).length, 4)
    const weeks = readFileSync('client/src/pages/course-weeks.tsx', 'utf8')
    assert.match(weeks, /\{isTrainer && editQuiz && !isLoadingEditQuiz && \(\r?\n\s*<FileQuizEditDialog/)
})
